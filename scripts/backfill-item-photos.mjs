#!/usr/bin/env node
/**
 * One-shot backfill — for every item that has a `photo_path` but no
 * `photo_data` yet, read the file off disk and stuff the bytes into the
 * new column. After this, the items detail/list pages serve photos from
 * the DB, photos travel with the row during sync, and the filesystem copy
 * is just redundant backup.
 *
 * Safe to re-run — items with `photo_data` already set are skipped.
 *
 * Usage (inside the dev container):
 *
 *   docker compose exec web node /app/scripts/backfill-item-photos.mjs
 *
 * Or on prod via Railway's run command — same node invocation. The script
 * uses the same DATABASE_URL the app uses, so no extra env setup.
 */

import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
const prisma = new PrismaClient();

async function main() {
  console.log("=== Item photo backfill ===");
  console.log(`Reading photos from: ${UPLOAD_DIR}\n`);

  // Pull every item that has a path-but-no-bytes. With ~500 items and
  // tiny WebP photos (~30 KB each) this fits comfortably in memory.
  const todo = await prisma.item.findMany({
    where: {
      photoPath: { not: null },
      photoData: null,
    },
    select: { id: true, code: true, photoPath: true },
  });
  console.log(`${todo.length} items to backfill.`);
  if (todo.length === 0) {
    console.log("Nothing to do — all items already have photo bytes in the DB.");
    return;
  }

  let ok = 0;
  let missing = 0;
  let error = 0;
  let bytesWritten = 0;
  const startedAt = Date.now();

  for (const row of todo) {
    const photoPath = row.photoPath;
    if (!photoPath) continue;
    const safe = photoPath.replace(/\\/g, "/").replace(/\.\./g, "");
    const absolute = path.join(UPLOAD_DIR, safe);
    try {
      const buf = await fs.readFile(absolute);
      await prisma.item.update({
        where: { id: row.id },
        data: {
          photoData: new Uint8Array(buf),
          photoMime: "image/webp",
        },
      });
      ok++;
      bytesWritten += buf.length;
      if (ok % 50 === 0) {
        const secs = ((Date.now() - startedAt) / 1000).toFixed(0);
        console.log(`  ${ok}/${todo.length} done · ${(bytesWritten / 1024 / 1024).toFixed(1)} MB · ${secs}s`);
      }
    } catch (e) {
      if (e?.code === "ENOENT") {
        missing++;
        if (missing <= 5) {
          console.log(`  missing: ${row.code} → ${photoPath}`);
        }
      } else {
        error++;
        console.log(`  error: ${row.code} → ${e?.message ?? e}`);
      }
    }
  }

  const secs = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`\n=== DONE ===`);
  console.log(`Backfilled: ${ok}`);
  console.log(`Missing files (file gone from disk): ${missing}`);
  console.log(`Errors: ${error}`);
  console.log(`Total bytes written: ${(bytesWritten / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Elapsed: ${secs}s`);
}

main()
  .catch((e) => {
    console.error("Backfill FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
