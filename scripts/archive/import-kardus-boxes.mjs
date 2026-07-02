#!/usr/bin/env node
/**
 * Record a Kardus Packing 57 purchase (melon carry-boxes) as a received batch
 * per existing item. Shipping/fees (order total − product subtotal) are spread
 * EQUALLY PER BOX and baked into each item's landed unit price, so inventory
 * value and COGS reflect what was actually paid.
 *
 *   Order total : Rp 149,525
 *   Subtotal    : Rp 72,750  (17 boxes)
 *   Shipping    : Rp 76,775  → 76,775 / 17 = Rp 4,516.1765 per box
 *
 *   DRY=1 node scripts/import-kardus-boxes.mjs   # preview
 *   node scripts/import-kardus-boxes.mjs         # execute
 */

import { PrismaClient } from "@prisma/client";

const DRY = process.env.DRY === "1";
const FORCE = process.env.FORCE === "1";
const prisma = new PrismaClient();

const ORG = "org_sparmanik";
const SUPPLIER_NAME = "Kardus Packing 57";
const ORDER_TOTAL = 149525;
const TODAY = new Date();

// code → { qty, base price per box (Rp, before shipping) }
const LINES = [
  { code: "SF00001", colour: "MERAH", qty: 2, base: 3750 },
  { code: "SF00002", colour: "PUTIH LUAR DALAM", qty: 2, base: 4450 },
  { code: "SF00003", colour: "PINK LUAR DALAM", qty: 2, base: 5050 },
  { code: "SF00004", colour: "HITAM LUAR DALAM", qty: 2, base: 5050 },
  { code: "SF00005", colour: "BABY BLUE LUAR DALAM", qty: 2, base: 5050 },
  { code: "SF00006", colour: "HITAM", qty: 3, base: 3750 },
  { code: "SF00007", colour: "PUTIH", qty: 4, base: 3700 },
];

const money = (x) => Number(x).toLocaleString("id-ID", { maximumFractionDigits: 2 });

async function main() {
  console.log(`\n=== Import Kardus Packing 57 boxes ${DRY ? "(DRY RUN)" : "(LIVE)"} ===\n`);

  const subtotal = LINES.reduce((s, l) => s + l.qty * l.base, 0);
  const totalQty = LINES.reduce((s, l) => s + l.qty, 0);
  const shipping = ORDER_TOTAL - subtotal;
  const shipPerBox = shipping / totalQty;
  console.log(
    `Subtotal Rp ${money(subtotal)} · Order Rp ${money(ORDER_TOTAL)} · Shipping Rp ${money(shipping)} ÷ ${totalQty} = Rp ${money(shipPerBox)}/box\n`,
  );

  const supplier = await prisma.supplier.findFirst({
    where: { organizationId: ORG, name: SUPPLIER_NAME },
    select: { id: true },
  });
  if (!supplier) throw new Error(`Supplier "${SUPPLIER_NAME}" not found`);

  // Guard: don't double-import. If any of these items already has a batch from
  // this supplier dated today, abort unless FORCE.
  const dayStart = new Date(TODAY);
  dayStart.setHours(0, 0, 0, 0);
  const already = await prisma.batch.count({
    where: {
      supplierId: supplier.id,
      date: { gte: dayStart },
      item: { code: { in: LINES.map((l) => l.code) } },
    },
  });
  if (already > 0 && !FORCE) {
    console.error(`GUARD: ${already} batch(es) from this supplier already dated today. Re-run with FORCE=1 to add anyway.`);
    process.exit(1);
  }

  const rows = [];
  let grandTotal = 0;

  for (const line of LINES) {
    const item = await prisma.item.findFirst({
      where: { organizationId: ORG, code: line.code },
      select: { id: true, name: true, defaultSupplierId: true },
    });
    if (!item) {
      console.error(`  MISSING item ${line.code} — skipped`);
      continue;
    }
    const landed = line.base + shipPerBox;
    const lineTotal = landed * line.qty;
    grandTotal += lineTotal;
    rows.push({ code: line.code, colour: line.colour, qty: line.qty, base: line.base, landed, lineTotal });

    if (DRY) continue;

    await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.create({
        data: {
          organizationId: ORG,
          itemId: item.id,
          supplierId: supplier.id,
          date: TODAY,
          qty: line.qty,
          price: landed, // landed = base + equal shipping share
          exchangeRate: 1,
        },
        select: { id: true },
      });
      // Adopt this supplier as the item's default if it had none.
      if (!item.defaultSupplierId) {
        await tx.item.update({ where: { id: item.id }, data: { defaultSupplierId: supplier.id } });
      }
      await tx.auditAction.create({
        data: {
          organizationId: ORG,
          type: "inventory.receive_stock",
          entityType: "Batch",
          entityId: batch.id,
          description: `Received ${line.qty} × ${line.colour} box @ Rp ${money(landed)} (incl. shipping) from ${SUPPLIER_NAME}`,
          userId: null,
          payload: { batchId: batch.id, itemId: item.id, supplierId: supplier.id, source: "kardus-import" },
        },
      });
    });
  }

  console.log("code     colour                 qty   base$   +ship   landed$    line$");
  console.log("-".repeat(74));
  for (const r of rows) {
    console.log([
      r.code.padEnd(8),
      r.colour.padEnd(22),
      String(r.qty).padStart(3),
      money(r.base).padStart(7),
      money(shipPerBox).padStart(8),
      money(r.landed).padStart(9),
      money(r.lineTotal).padStart(9),
    ].join(" "));
  }
  console.log("-".repeat(74));
  console.log(`TOTAL landed: Rp ${money(grandTotal)}  (should match order Rp ${money(ORDER_TOTAL)})`);
  console.log(`${DRY ? "DRY RUN — nothing written" : "WRITTEN — 7 batches received"}\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\nFAILED:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
