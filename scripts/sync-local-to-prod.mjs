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
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const PROD_URL = process.env.PROD_DATABASE_URL;
/** Optional — when set, the script also syncs the local uploads/ dir to
 *  Railway via the /api/admin/upload-passthrough endpoint. Two env vars:
 *   - PROD_APP_URL: e.g. https://web-production-1e6de.up.railway.app
 *   - SYNC_ADMIN_SECRET: must match the env var of the same name on Railway
 *  When either is missing the DB-only path runs and the user is told to
 *  set them next time. */
const PROD_APP_URL = (process.env.PROD_APP_URL ?? "").replace(/\/$/, "");
const SYNC_ADMIN_SECRET = process.env.SYNC_ADMIN_SECRET ?? "";
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

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
  const dumpProd = spawnSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "db",
      "pg_dump",
      "--no-owner",
      "--no-privileges",
      PROD_URL,
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  if (dumpProd.status !== 0) {
    console.error(
      `\nFAILED to read from prod. Status=${dumpProd.status}. Check the URL works:\n  docker compose exec db psql "${maskUrl(PROD_URL)}" -c "SELECT version();"`,
    );
    process.exit(1);
  }
  await import("node:fs").then((fs) =>
    fs.writeFileSync(BACKUP_FILE, dumpProd.stdout),
  );
  const backupBytes = dumpProd.stdout.length;
  console.log(`     OK — wrote ${(backupBytes / 1024).toFixed(0)} KB.`);

  // -------- 2. Dump local data ------------------------------------------

  console.log(`\n[2/3] Dumping local data (data-only)...`);
  // We dump --data-only because prod's schema is already correct (managed
  // by prisma migrate). --disable-triggers lets us COPY into tables that
  // have FK constraints; we'll re-enable them after restore.
  run(
    `docker compose exec -T db pg_dump -U sparmanik -d sparmanik --data-only --disable-triggers --no-owner --no-privileges > ${LOCAL_DUMP}`,
    { shell: true },
  );
  console.log(`     OK — wrote ${LOCAL_DUMP}.`);

  // -------- 3. Apply to prod --------------------------------------------

  console.log(`\n[3/3] Applying to prod...`);
  console.log(
    `\n  Truncating ${DELETE_ORDER.length} tables on prod (in FK order)...`,
  );
  const truncateSql = `BEGIN; SET CONSTRAINTS ALL DEFERRED; ${DELETE_ORDER.map((t) => `TRUNCATE TABLE "${t}" CASCADE;`).join(" ")} COMMIT;`;
  run(
    `docker compose exec -T db psql "${PROD_URL}" -c "${truncateSql.replace(/"/g, '\\"')}"`,
    { shell: true },
  );

  console.log(`\n  Restoring local data to prod...`);
  // Stream the local dump through docker into prod's psql. -1 wraps in a
  // single transaction so a mid-dump failure rolls back cleanly.
  run(
    `docker compose exec -T db sh -c 'psql "${PROD_URL}" -1 < ${LOCAL_DUMP.replace(/\\/g, "/")}'`,
    { shell: true },
  ).catch?.(() => {}); // some platforms throw on non-zero; we check below

  console.log(`\n  Done.`);

  // -------- 4. Verify ---------------------------------------------------

  console.log(`\nVerifying...`);
  const tables = ["staff", "items", "batches", "ai_provider_keys", "users"];
  for (const t of tables) {
    try {
      const out = execSync(
        `docker compose exec -T db psql "${PROD_URL}" -t -A -c "SELECT COUNT(*) FROM ${t};"`,
        { shell: true },
      )
        .toString()
        .trim();
      console.log(`  prod.${t.padEnd(20)} → ${out} rows`);
    } catch (e) {
      console.log(`  prod.${t.padEnd(20)} → ERROR: ${e.message}`);
    }
  }

  // -------- 5. Upload local photos / receipts to prod's Volume ----------

  if (PROD_APP_URL && SYNC_ADMIN_SECRET && existsSync(UPLOAD_DIR)) {
    console.log(`\n[4/4] Pushing local uploads/ to prod's Volume ...`);
    const files = listFilesRecursive(UPLOAD_DIR).filter(
      (f) => !path.basename(f).startsWith("."),
    );
    console.log(`     ${files.length} files to push.`);

    let pushed = 0;
    let failed = 0;
    let skipped = 0;
    let bytes = 0;
    const startedAt = Date.now();
    for (const abs of files) {
      const rel = path.relative(UPLOAD_DIR, abs).replace(/\\/g, "/");
      const size = statSync(abs).size;
      // Skip anything obviously broken (zero-byte) or way too big — the
      // route caps at ~10 MB for non-images but 20 MB here is the upper
      // bound we'll bother with.
      if (size === 0 || size > 20 * 1024 * 1024) {
        skipped++;
        continue;
      }
      try {
        const fd = new FormData();
        fd.set("relativePath", rel);
        fd.set("file", new Blob([readFileSync(abs)]), path.basename(abs));
        const r = await fetch(
          `${PROD_APP_URL}/api/admin/upload-passthrough`,
          {
            method: "POST",
            headers: { authorization: `Bearer ${SYNC_ADMIN_SECRET}` },
            body: fd,
          },
        );
        if (!r.ok) {
          failed++;
          if (failed <= 5) {
            // Print only the first few failures so the console doesn't
            // drown in identical 401s when the secret is wrong.
            console.log(
              `     ${rel}: HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`,
            );
          }
          continue;
        }
        pushed++;
        bytes += size;
        if (pushed % 50 === 0) {
          const secs = ((Date.now() - startedAt) / 1000).toFixed(0);
          console.log(`     ${pushed}/${files.length} uploaded (${secs}s)...`);
        }
      } catch (e) {
        failed++;
        if (failed <= 3) {
          console.log(`     ${rel}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
    const secs = ((Date.now() - startedAt) / 1000).toFixed(0);
    console.log(
      `     Done — pushed ${pushed}, failed ${failed}, skipped ${skipped} (${(bytes / 1024 / 1024).toFixed(1)} MB in ${secs}s)`,
    );
  } else {
    console.log(`\n[4/4] Skipping photo sync.`);
    if (!PROD_APP_URL) {
      console.log(
        `     Set PROD_APP_URL=https://web-production-1e6de.up.railway.app to enable.`,
      );
    }
    if (!SYNC_ADMIN_SECRET) {
      console.log(
        `     Set SYNC_ADMIN_SECRET=<your secret> to enable (must match the env var on Railway).`,
      );
    }
    if (!existsSync(UPLOAD_DIR)) {
      console.log(`     No local uploads/ directory at ${UPLOAD_DIR}.`);
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`\nBackup of prod-as-it-was kept at ${BACKUP_FILE}`);
  console.log(
    `Rollback (if needed): docker compose exec -T db sh -c 'psql "$PROD_DATABASE_URL" < ${BACKUP_FILE}'`,
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
    `\nProd may be in an inconsistent state. Restore from backup with:\n  docker compose exec -T db sh -c 'psql "$PROD_DATABASE_URL" < ${BACKUP_FILE}'`,
  );
  process.exit(1);
});
