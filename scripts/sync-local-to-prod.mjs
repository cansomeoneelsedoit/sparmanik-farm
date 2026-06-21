#!/usr/bin/env node
/**
 * One-time local → Railway prod data sync.
 *
 * Why this exists: local Postgres and Railway Postgres are completely
 * separate databases. Edits in the local UI (staff, items, suppliers, etc.)
 * never reach prod, so prod data drifts and gets stale. This script does a
 * one-time full data clone from local → prod, with a Railway-side backup
 * file written FIRST so we can roll back if anything goes wrong.
 *
 * Usage:
 *
 *   set PROD_DATABASE_URL=postgresql://postgres:PASS@host.railway.app:5432/railway
 *   npm run sync:local-to-prod
 *
 * The script DOES NOT save the URL anywhere. It only lives in your shell's
 * environment for the duration of the run.
 *
 * What it does, in order:
 *
 *   1. Backs up prod to `prod-backup-YYYYMMDD-HHMMSS.sql` in the project
 *      root. KEEP THIS FILE. It's your rollback parachute.
 *   2. Dumps local data (data-only, no schema — prod already has the
 *      schema via prisma migrate deploy).
 *   3. On prod: truncates all business tables in dependency order, then
 *      restores local data.
 *
 * Tables touched: every table prisma knows about. Auth users (including
 * dev@), AI provider keys (4 from local), and org memberships all get
 * pushed too — that's fine because local has all the keys and seed
 * recreates dev@ on next prod boot if anything went sideways.
 *
 * Rollback: if anything looks wrong on prod after this runs,
 *   psql "$PROD_DATABASE_URL" < prod-backup-YYYYMMDD-HHMMSS.sql
 * restores prod to exactly the state it was in before this script.
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const PROD_URL = process.env.PROD_DATABASE_URL;

if (!PROD_URL) {
  console.error(`
ERROR: PROD_DATABASE_URL is not set in your environment.

This script intentionally does NOT prompt for the URL and does NOT save
it anywhere. Set it in your shell, run the script, then unset it:

  Windows (cmd):
    set PROD_DATABASE_URL=postgresql://...
    npm run sync:local-to-prod
    set PROD_DATABASE_URL=

  Windows (PowerShell):
    $env:PROD_DATABASE_URL = "postgresql://..."
    npm run sync:local-to-prod
    Remove-Item Env:PROD_DATABASE_URL

  macOS / Linux:
    PROD_DATABASE_URL='postgresql://...' npm run sync:local-to-prod

Find the URL in Railway dashboard → Postgres plugin → Variables →
DATABASE_URL (or use the "Connect" panel). Paste it WHOLE, including
the schema, query string, etc.
`);
  process.exit(1);
}

const TS = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const BACKUP_FILE = `prod-backup-${TS}.sql`;
const DUMP_DIR = path.join(process.cwd(), "tmp-sync");
const LOCAL_DUMP = path.join(DUMP_DIR, "local-data.sql");

if (!existsSync(DUMP_DIR)) mkdirSync(DUMP_DIR);

// Tables in deletion order — children first, then parents. Anything missing
// here would block the truncate; this list comes from prisma/schema.prisma.
const DELETE_ORDER = [
  "ai_messages",
  "ai_conversations",
  "ai_provider_keys",
  "expenses",
  "audit_actions",
  "wage_entry_lines",
  "wage_entries",
  "batch_consumptions",
  "harvest_assets",
  "harvest_usages",
  "harvest_produces",
  "sales",
  "harvests",
  "tasks",
  "videos",
  "sops",
  "nutrient_recipes",
  "batches",
  "items",
  "suppliers",
  "labour_tasks",
  "staff_rates",
  "staff",
  "produces",
  "categories",
  "greenhouses",
  "settings",
  "organization_memberships",
  "organizations",
  "verification_tokens",
  "sessions",
  "accounts",
  "users",
];

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  return execSync(cmd, { stdio: "inherit", ...opts });
}

async function confirm(question) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const a = (await rl.question(question)).trim().toLowerCase();
  rl.close();
  return a === "yes" || a === "y";
}

async function main() {
  console.log("\n=== Sparmanik Farm: local → Railway prod data sync ===");
  console.log(`\nThis will:`);
  console.log(`  1. Back up Railway prod to ${BACKUP_FILE}`);
  console.log(`  2. Dump every row from your local Docker Postgres`);
  console.log(`  3. Truncate prod's data tables and reload from local`);
  console.log(
    `\nAfter this runs, prod will be IDENTICAL to your local DB.\n`,
  );

  if (!(await confirm("Type 'yes' to proceed: "))) {
    console.log("Aborted.");
    process.exit(0);
  }

  // -------- 1. Backup prod -----------------------------------------------

  console.log(`\n[1/3] Backing up Railway prod to ./${BACKUP_FILE} ...`);
  // We pipe pg_dump output through the docker postgres container (which
  // ships pg_dump 16) and write it on the host so the file lands in the
  // project root regardless of platform.
  // Railway runs Postgres 18; the local `db` container ships pg_dump 16, which
  // refuses to dump a newer server. So all PROD-side ops go through a pinned
  // postgres:18 client image (reaches Railway over the public internet). The
  // local data dump (step 2) still uses the local container — same version.
  const dumpProd = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "postgres:18",
      "pg_dump",
      "--no-owner",
      "--no-privileges",
      PROD_URL,
    ],
    {
      stdio: ["ignore", "pipe", "inherit"],
      // Photos live in the dump now — the default 1 MB maxBuffer would
      // kill the backup step. Allow up to 1 GB.
      maxBuffer: 1024 * 1024 * 1024,
    },
  );
  if (dumpProd.status !== 0) {
    console.error(
      `\nFAILED to read from prod. Status=${dumpProd.status}. Check the URL works:\n  docker run --rm postgres:18 psql "${maskUrl(PROD_URL)}" -c "SELECT version();"`,
    );
    process.exit(1);
  }
  await import("node:fs").then((fs) =>
    fs.writeFileSync(BACKUP_FILE, dumpProd.stdout),
  );
  const backupBytes = dumpProd.stdout.length;
  console.log(`     OK — wrote ${(backupBytes / 1024).toFixed(0)} KB.`);

  // -------- 2. Dump local data ------------------------------------------

  console.log(`\n[2/3] Dumping local database (full clone: schema + data)...`);
  // FULL dump (not data-only). prod's schema can drift from local, so we ship
  // local's COMPLETE schema + data. --clean --if-exists makes the dump DROP
  // each existing object on prod first, then recreate it from local — so prod
  // ends up identical to local regardless of any prior drift, and there are
  // no leftover-row / migration-state conflicts.
  run(
    `docker compose exec -T db pg_dump -U sparmanik -d sparmanik --clean --if-exists --no-owner --no-privileges > ${LOCAL_DUMP}`,
    { shell: true },
  );
  console.log(`     OK — wrote ${LOCAL_DUMP}.`);

  // -------- 3. Apply to prod --------------------------------------------

  console.log(`\n[3/3] Cloning local → prod (drop + recreate + load, one transaction)...`);
  // Stream the full dump into prod's psql under a single transaction
  // (-1) with ON_ERROR_STOP so the FIRST error aborts and rolls back the
  // WHOLE thing — prod is then left exactly as it was (the backup above is
  // the parachute either way). No half-applied window.
  run(
    `docker run --rm -i postgres:18 psql "${PROD_URL}" -v ON_ERROR_STOP=1 -1 < "${LOCAL_DUMP}"`,
    { shell: true },
  );

  console.log(`\n  Done.`);

  // -------- 4. Verify ---------------------------------------------------

  console.log(`\nVerifying...`);
  const tables = ["staff", "items", "batches", "ai_provider_keys", "users"];
  for (const t of tables) {
    try {
      const out = execSync(
        `docker run --rm postgres:18 psql "${PROD_URL}" -t -A -c "SELECT COUNT(*) FROM ${t};"`,
        { shell: true },
      )
        .toString()
        .trim();
      console.log(`  prod.${t.padEnd(20)} → ${out} rows`);
    } catch (e) {
      console.log(`  prod.${t.padEnd(20)} → ERROR: ${e.message}`);
    }
  }

  // Photos now live in the items.photo_data column (since migration
  // 20260609010000_item_photo_blob), so they get carried automatically
  // by the data-only pg_dump above. No separate file sync needed.
  // The old POST /api/admin/upload-passthrough route still exists for
  // backwards compat with any pre-blob items that have photoPath set
  // but no photo_data — those are picked up by the backfill script
  // on the first deploy after the migration runs.

  console.log(`\n=== DONE ===`);
  console.log(`\nBackup of prod-as-it-was kept at ${BACKUP_FILE}`);
  console.log(
    `Rollback (if needed): docker run --rm -i postgres:18 psql "<PASTE PROD URL>" < ${BACKUP_FILE}`,
  );
  console.log(
    `\nProd is now identical to local. From now on, edit data on prod (https://web-production-1e6de.up.railway.app) so the two stay in sync.`,
  );
}

function listFilesRecursive(dir) {
  const out = [];
  function walk(d) {
    for (const e of readdirSync(d)) {
      const p = path.join(d, e);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (s.isFile()) out.push(p);
    }
  }
  walk(dir);
  return out;
}

function maskUrl(u) {
  return u.replace(/:[^:@/]+@/, ":•••@");
}

main().catch((e) => {
  console.error("\nSync FAILED:", e.message);
  console.error(
    `\nProd may be in an inconsistent state. Restore from backup with:\n  docker run --rm -i postgres:18 psql "<PASTE PROD URL>" < ${BACKUP_FILE}`,
  );
  process.exit(1);
});
