#!/usr/bin/env node
/**
 * Snapshot the Railway production database to a local file.
 *
 * Why this exists: since migration 20260609010000_item_photo_blob the
 * Postgres database on Railway is the single copy of EVERYTHING — items,
 * batches, sales, staff, wages, AND all the item photos. If that database
 * is ever lost or corrupted, this folder of dumps is the way back.
 *
 * Usage (normally via backup-prod.cmd, which prompts for the URL):
 *
 *   set PROD_DATABASE_URL=postgresql://postgres:PASS@host.railway.app:5432/railway
 *   npm run backup:prod
 *   set PROD_DATABASE_URL=
 *
 * The script never writes the URL to disk. Dumps land in ./backups/ as
 * prod-backup-YYYYMMDD-HHMMSS.sql (full dump: schema + data, restorable
 * standalone). The 10 newest are kept; older ones are deleted.
 *
 * Restore (disaster recovery), against a FRESH empty database:
 *   docker compose exec -T db sh -c 'psql "$PROD_DATABASE_URL" < backups/prod-backup-....sql'
 */

import { execSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const PROD_URL = process.env.PROD_DATABASE_URL;

if (!PROD_URL) {
  console.error(`
ERROR: PROD_DATABASE_URL is not set.

Run backup-prod.cmd instead (it prompts you to paste the URL), or set it
in your shell first:

  Windows (cmd):
    set PROD_DATABASE_URL=postgresql://...
    npm run backup:prod
    set PROD_DATABASE_URL=
`);
  process.exit(1);
}

// Timestamp in LOCAL time so the filename matches the clock on the wall.
const d = new Date();
const pad = (n) => String(n).padStart(2, "0");
const TS = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const BACKUP_DIR = path.join(process.cwd(), "backups");
const BACKUP_FILE = path.join(BACKUP_DIR, `prod-backup-${TS}.sql`);
const KEEP = 10;

function maskUrl(u) {
  return u.replace(/:[^:@/]+@/, ":•••@");
}

function main() {
  console.log("\n=== Sparmanik Farm: Railway prod → local backup ===\n");

  // -------- 0. Preflight: the dump runs through the local Docker
  // postgres container (it ships pg_dump 16), so Docker must be up.
  let dbContainer = "";
  try {
    dbContainer = execSync("docker compose ps -q db").toString().trim();
  } catch {
    /* fall through to the check below */
  }
  if (!dbContainer) {
    console.error(
      "ERROR: Docker isn't running (or the db container is down).\n" +
        "Open Docker Desktop, wait for it to go green, then run this again.",
    );
    process.exit(1);
  }

  // -------- 1. Dump prod --------------------------------------------------
  console.log(`Reading from ${maskUrl(PROD_URL)} ...`);
  console.log("(With photos in the database this can take a minute.)\n");

  const dump = spawnSync(
    "docker",
    // Use a pinned postgres:18 client image, NOT the local `db` container: that
    // ships pg_dump 16, which refuses to dump the newer Railway PG18 server, so
    // this script silently failed and the backups/ folder stayed empty
    // (app review #6). Mirrors sync-local-to-prod.mjs.
    ["run", "--rm", "postgres:18", "pg_dump", "--no-owner", "--no-privileges", PROD_URL],
    {
      stdio: ["ignore", "pipe", "inherit"],
      // Photos live in the dump now — allow up to 1 GB before bailing.
      maxBuffer: 1024 * 1024 * 1024,
    },
  );
  if (dump.status !== 0 || !dump.stdout?.length) {
    console.error(
      `\nFAILED to read from prod (status=${dump.status}).\n` +
        `Check the URL is the Postgres "Connection URL" from Railway's Connect tab.`,
    );
    process.exit(1);
  }

  // Integrity check: pg_dump always ends a successful dump with this line.
  const tail = dump.stdout.subarray(-200).toString();
  if (!tail.includes("PostgreSQL database dump complete")) {
    console.error(
      "\nFAILED: the dump ended early (missing pg_dump's completion marker)." +
        "\nNothing was saved. Try again; if it keeps failing, check your internet connection.",
    );
    process.exit(1);
  }

  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR);
  writeFileSync(BACKUP_FILE, dump.stdout);
  const mb = dump.stdout.length / (1024 * 1024);
  console.log(`OK — wrote ${path.relative(process.cwd(), BACKUP_FILE)} (${mb.toFixed(1)} MB).`);

  // -------- 2. Quick sanity counts ---------------------------------------
  console.log("\nWhat's inside (row counts straight from prod):");
  for (const t of ["items", "batches", "staff", "stock_sales", "sales"]) {
    try {
      const out = execSync(
        `docker run --rm postgres:18 psql "${PROD_URL}" -t -A -c "SELECT COUNT(*) FROM ${t};"`,
        { shell: true },
      )
        .toString()
        .trim();
      console.log(`  ${t.padEnd(14)} ${out} rows`);
    } catch {
      console.log(`  ${t.padEnd(14)} (couldn't count — not fatal)`);
    }
  }

  // -------- 3. Prune old backups ------------------------------------------
  const all = readdirSync(BACKUP_DIR)
    .filter((f) => /^prod-backup-\d{8}-\d{6}\.sql$/.test(f))
    .sort()
    .reverse(); // newest first (timestamp sorts lexicographically)
  const stale = all.slice(KEEP);
  for (const f of stale) unlinkSync(path.join(BACKUP_DIR, f));
  console.log(
    `\nKeeping the ${Math.min(all.length, KEEP)} newest backup(s) in .\\backups\\` +
      (stale.length ? ` — deleted ${stale.length} old one(s).` : "."),
  );

  console.log("\n=== DONE — your farm data is safe on this computer. ===\n");
}

try {
  main();
} catch (e) {
  console.error("\nBackup FAILED:", e.message);
  process.exit(1);
}
