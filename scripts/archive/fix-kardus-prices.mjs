#!/usr/bin/env node
/**
 * Correction: the Kardus melon boxes (SF00001–SF00007) were ALREADY in
 * inventory (batches dated 2026-06-07 at base prices in the old thousands
 * scale). The earlier import-kardus-boxes run wrongly ADDED a second batch
 * each, doubling the stock.
 *
 * This undoes that: deletes the duplicate batches created today, and updates
 * the ORIGINAL batches' prices to the landed cost (base + equal shipping
 * share), so the order is recorded once, at the right price, with shipping
 * spread across the boxes.
 *
 *   DRY=1 node scripts/fix-kardus-prices.mjs   # preview
 *   node scripts/fix-kardus-prices.mjs         # execute
 */

import { PrismaClient } from "@prisma/client";

const DRY = process.env.DRY === "1";
const prisma = new PrismaClient();
const ORG = "org_sparmanik";
const SUPPLIER_NAME = "Kardus Packing 57";
const ORDER_TOTAL = 149525;

const LINES = [
  { code: "SF00001", qty: 2, base: 3750 },
  { code: "SF00002", qty: 2, base: 4450 },
  { code: "SF00003", qty: 2, base: 5050 },
  { code: "SF00004", qty: 2, base: 5050 },
  { code: "SF00005", qty: 2, base: 5050 },
  { code: "SF00006", qty: 3, base: 3750 },
  { code: "SF00007", qty: 4, base: 3700 },
];

const money = (x) => Number(x).toLocaleString("id-ID", { maximumFractionDigits: 2 });

async function main() {
  console.log(`\n=== Fix Kardus box prices ${DRY ? "(DRY RUN)" : "(LIVE)"} ===\n`);

  const subtotal = LINES.reduce((s, l) => s + l.qty * l.base, 0);
  const totalQty = LINES.reduce((s, l) => s + l.qty, 0);
  const shipPerBox = (ORDER_TOTAL - subtotal) / totalQty;

  const supplier = await prisma.supplier.findFirst({
    where: { organizationId: ORG, name: SUPPLIER_NAME },
    select: { id: true },
  });
  if (!supplier) throw new Error("Supplier not found");

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  let deleted = 0;
  let updated = 0;
  const rows = [];

  for (const line of LINES) {
    const item = await prisma.item.findFirst({
      where: { organizationId: ORG, code: line.code },
      select: { id: true },
    });
    if (!item) { console.error(`  MISSING ${line.code}`); continue; }

    const batches = await prisma.batch.findMany({
      where: { itemId: item.id, supplierId: supplier.id },
      select: { id: true, qty: true, price: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const mine = batches.filter((b) => b.createdAt >= dayStart);     // duplicates to remove
    const originals = batches.filter((b) => b.createdAt < dayStart); // keep + reprice
    const landed = line.base + shipPerBox;

    rows.push({
      code: line.code,
      dupes: mine.length,
      originals: originals.length,
      landed,
    });

    if (DRY) continue;

    await prisma.$transaction(async (tx) => {
      for (const b of mine) {
        await tx.batchConsumption.deleteMany({ where: { batchId: b.id } });
        await tx.batch.delete({ where: { id: b.id } });
        deleted++;
      }
      for (const b of originals) {
        await tx.batch.update({ where: { id: b.id }, data: { price: landed } });
        updated++;
      }
    });
  }

  if (!DRY) {
    await prisma.auditAction.deleteMany({
      where: { type: "inventory.receive_stock", payload: { path: ["source"], equals: "kardus-import" } },
    });
  }

  console.log("code     dupes-removed  originals-repriced  landed$");
  console.log("-".repeat(56));
  for (const r of rows) {
    console.log([r.code.padEnd(8), String(r.dupes).padStart(12), String(r.originals).padStart(18), money(r.landed).padStart(10)].join(" "));
  }
  console.log("-".repeat(56));
  console.log(`Shipping/box: Rp ${money(shipPerBox)}`);
  console.log(DRY ? "DRY RUN — nothing written" : `Done — removed ${deleted} duplicate batch(es), repriced ${updated} original(s).`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error("\nFAILED:", e.message); await prisma.$disconnect(); process.exit(1); });
