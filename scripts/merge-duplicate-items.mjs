#!/usr/bin/env node
/**
 * Bulk-merge exact-duplicate inventory items.
 *
 * "Exact duplicate" = same organization + same normalised name
 * (lower+trim) + same unit + same sub_factor. These are almost always
 * the result of importing the Shopee export more than once, so each
 * "copy" is really the same SKU. Merging re-points every batch /
 * harvest usage / harvest install onto ONE kept item and deletes the
 * rest — lossless, because all the purchase history moves with it.
 *
 * Target selection (which row survives), in priority order:
 *   1. most batches (keep the one that already has the most history)
 *   2. has a photo in the DB
 *   3. lowest code (oldest SF number)
 *
 * Uses a PLAIN PrismaClient (no org-scoping extension) so the script
 * sees every row and controls scoping itself. Safe because we group by
 * organization_id and never merge across orgs.
 *
 * Usage:
 *   DRY=1 node scripts/merge-duplicate-items.mjs   # preview only
 *   node scripts/merge-duplicate-items.mjs         # execute
 */

import { PrismaClient } from "@prisma/client";

const DRY = process.env.DRY === "1";
const prisma = new PrismaClient();

function norm(s) {
  return (s ?? "").trim().toLowerCase();
}

async function main() {
  console.log(`=== Merge duplicate items ${DRY ? "(DRY RUN)" : "(LIVE)"} ===\n`);

  const items = await prisma.item.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      subFactor: true,
      organizationId: true,
      photoData: true,
      _count: { select: { batches: true, harvestUsages: true, harvestAssets: true } },
    },
  });

  // Group by org + normalised name + unit + sub_factor.
  const groups = new Map();
  for (const it of items) {
    if (!norm(it.name)) continue; // skip unnamed — handled elsewhere
    const key = [
      it.organizationId ?? "_",
      norm(it.name),
      it.unit ?? "",
      it.subFactor ? it.subFactor.toString() : "-",
    ].join("||");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }

  let clusterCount = 0;
  let removed = 0;
  let batchesMoved = 0;

  for (const [, members] of groups) {
    if (members.length < 2) continue;
    clusterCount++;

    // Pick the survivor.
    const sorted = [...members].sort((a, b) => {
      const ab = a._count.batches + a._count.harvestUsages + a._count.harvestAssets;
      const bb = b._count.batches + b._count.harvestUsages + b._count.harvestAssets;
      if (bb !== ab) return bb - ab; // most history first
      const ap = a.photoData ? 1 : 0;
      const bp = b.photoData ? 1 : 0;
      if (bp !== ap) return bp - ap; // has photo
      return a.code.localeCompare(b.code); // lowest code
    });
    const target = sorted[0];
    const sources = sorted.slice(1);

    const movedBatches = sources.reduce((s, x) => s + x._count.batches, 0);
    console.log(
      `• "${target.name.slice(0, 55)}" [${target.unit}]\n` +
        `    keep ${target.code} (${target._count.batches} batches)` +
        `  ←  merge ${sources.map((s) => `${s.code}(${s._count.batches}b)`).join(", ")}`,
    );

    if (!DRY) {
      for (const src of sources) {
        await prisma.$transaction([
          prisma.batch.updateMany({
            where: { itemId: src.id },
            data: { itemId: target.id },
          }),
          prisma.harvestUsage.updateMany({
            where: { itemId: src.id },
            data: { itemId: target.id },
          }),
          prisma.harvestAsset.updateMany({
            where: { itemId: src.id },
            data: { itemId: target.id },
          }),
          prisma.item.delete({ where: { id: src.id } }),
        ]);
      }
    }
    removed += sources.length;
    batchesMoved += movedBatches;
  }

  console.log(
    `\n=== ${DRY ? "WOULD MERGE" : "MERGED"} ===\n` +
      `Clusters: ${clusterCount}\n` +
      `Items removed: ${removed}\n` +
      `Batches re-pointed: ${batchesMoved}\n` +
      (DRY ? `\nRun WITHOUT DRY=1 to apply.` : `\nDone.`),
  );
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
