#!/usr/bin/env node
/**
 * Allocate the GH-1 materials list into the "Test" greenhouse
 * (harvest cmqn5krcx0001oc4yz4wp4oul) — BYPASS MODE, measured in real units.
 *
 * Boyd wants each line shown in its smallest real unit (pcs / metres / ml /
 * litre / kg / slab / gulung) with a per-unit price, so "5 packs of 20" reads
 * "100 pcs". To make that display correctly the script also FIXES the
 * sub-unit / pack-size on the items whose pack data was wrong or missing
 * (e.g. weedmat was set to 2 instead of 100). Quantities come straight from
 * "List kebutuhan GH-1.pdf".
 *
 * Cost: each line is an inventory-free HarvestAsset whose amortisedCharge =
 * listQty × perUnitPrice. perUnitPrice = avg pack price ÷ subFactor (or an
 * online price for the pump / H3PO4). No FIFO, no batches, no stock drawn —
 * deleting the harvest removes everything cleanly.
 *
 *   DRY=1 node scripts/allocate-test-harvest.mjs   # preview
 *   node scripts/allocate-test-harvest.mjs         # execute (idempotent)
 *
 * LOCAL ONLY.
 */

import { PrismaClient } from "@prisma/client";

const DRY = process.env.DRY === "1";
const prisma = new PrismaClient();

const HARVEST_ID = "cmqn5krcx0001oc4yz4wp4oul";
const ORG = "org_sparmanik";
const TODAY = new Date();
const PUMP_NAME = "Pompa Celup YLP3500-55W";

// listQty = quantity in the real sub-unit. costIDR = the REAL allocated cost
// from Boyd's verified purchase table (raw Rupiah — the DB's own prices are
// inconsistently scaled, so we ignore them and stamp the true cost directly).
// subUnit/subFactor are written onto the item so quantities read in real units.
const LINES = [
  { n: 1, code: "SF00444", subUnit: "metres", subFactor: 500, listQty: 250, costIDR: 270000, kind: "consumable" },
  { n: 2, code: "SF00428", subUnit: "metres", subFactor: 100, listQty: 300, costIDR: 1599000, kind: "consumable" },
  { n: 3, code: "SF00085", listQty: 450, costIDR: 364500, kind: "consumable" },
  { n: 4, code: "SF00429", listQty: 450, costIDR: 1570500, kind: "consumable" },
  { n: 5, code: "SF00442", listQty: 25, costIDR: 125000, kind: "consumable" },
  { n: 6, code: "SF00433", subUnit: "metres", subFactor: 100, listQty: 300, costIDR: 2996100, kind: "consumable" },
  { n: 7, code: "SF00437", subUnit: "pieces", subFactor: 50, listQty: 500, costIDR: 1190000, kind: "consumable", note: "only 250 pcs bought so far (Rp595k) — extrapolated to 500" },
  { n: 8, code: "SF00404", listQty: 410, costIDR: 6970000, kind: "consumable" },
  { n: 9, code: "SF00548", subUnit: "metres", subFactor: 25, listQty: 40, costIDR: 1840000, kind: "consumable", note: "your table listed 20 sheets Rp1.84M; kept on the metre item" },
  { n: 10, code: "SF00505", listQty: 1, costIDR: 541000, kind: "durable" },
  { n: 11, code: "SF00427", listQty: 1, costIDR: 499000, kind: "durable" },
  { n: 12, code: "SF00422", subUnit: "ml", subFactor: 500, listQty: 500, costIDR: 615000, kind: "consumable" },
  { n: 13, code: "SF00056", subUnit: "ml", subFactor: 50, listQty: 500, costIDR: 656000, kind: "consumable" },
  { n: 14, code: "SF00425", listQty: 1, costIDR: 950000, kind: "durable" },
  { n: 15, code: "SF00417", subUnit: "litre", subFactor: 1, listQty: 35, costIDR: 1025000, kind: "consumable" },
  { n: 16, code: "SF00418", subUnit: "kg", subFactor: 1, listQty: 3, costIDR: 97650, kind: "consumable" },
  { n: 17, code: "SF00419", listQty: 1, costIDR: 44923, kind: "durable" },
  { n: 18, code: "SF00486", listQty: 1, costIDR: 245900, kind: "durable" },
  { n: 19, code: "SF00440", subUnit: "gulung", subFactor: 1, listQty: 50, costIDR: 947500, kind: "consumable" },
  { n: 20, code: "SF00266", subUnit: "slab", subFactor: 1, listQty: 4, costIDR: 336000, kind: "consumable" },
  { n: 21, pump: true, listQty: 2, costIDR: 300000, kind: "durable", note: "not in your table — est. Rp150k/pc online" },
  { n: 22, code: "SF00420", listQty: 10, costIDR: 265000, kind: "consumable", note: "not in your table — est. from inventory" },
];

const money = (x) => Number(x).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Average PACK price (Σ remaining×price ÷ Σ remaining), fallback last-paid. */
async function avgPackPrice(itemId) {
  const batches = await prisma.batch.findMany({
    where: { itemId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: { qty: true, price: true, consumptions: { select: { qty: true } } },
  });
  let totRemain = 0;
  let totVal = 0;
  let lastPrice = null;
  for (const b of batches) {
    const consumed = b.consumptions.reduce((s, c) => s + Number(c.qty), 0);
    const rem = Number(b.qty) - consumed;
    totRemain += rem;
    totVal += rem * Number(b.price);
    lastPrice = Number(b.price);
  }
  return totRemain > 0 ? totVal / totRemain : lastPrice;
}

async function clearPriorAllocation() {
  const usages = await prisma.harvestUsage.findMany({ where: { harvestId: HARVEST_ID }, select: { id: true } });
  const assets = await prisma.harvestAsset.findMany({ where: { harvestId: HARVEST_ID }, select: { id: true } });
  const usageIds = usages.map((u) => u.id);
  const assetIds = assets.map((a) => a.id);
  if (DRY) {
    console.log(`(would clear ${usageIds.length} usages + ${assetIds.length} assets + audits + H3PO4 synthetic batch)\n`);
    return;
  }
  await prisma.$transaction(async (tx) => {
    if (usageIds.length || assetIds.length) {
      await tx.batchConsumption.deleteMany({
        where: {
          OR: [
            usageIds.length ? { harvestUsageId: { in: usageIds } } : { id: "__none__" },
            assetIds.length ? { harvestAssetId: { in: assetIds } } : { id: "__none__" },
          ],
        },
      });
      await tx.harvestUsage.deleteMany({ where: { harvestId: HARVEST_ID } });
      await tx.harvestAsset.deleteMany({ where: { harvestId: HARVEST_ID } });
    }
    await tx.auditAction.deleteMany({
      where: {
        type: { in: ["harvest.use_stock", "harvest.install_asset", "harvest.checkin_asset", "harvest.damage_asset"] },
        payload: { path: ["harvestId"], equals: HARVEST_ID },
      },
    });
    const h3 = await tx.item.findFirst({ where: { organizationId: ORG, code: "SF00417" }, select: { id: true } });
    if (h3) await tx.batch.deleteMany({ where: { itemId: h3.id, consumptions: { none: {} } } });
  });
  console.log(`Cleared ${usageIds.length} usage + ${assetIds.length} asset rows; inventory restored.\n`);
}

async function main() {
  console.log(`\n=== Allocate Test harvest (real units) ${DRY ? "(DRY RUN)" : "(LIVE)"} ===\n`);
  const harvest = await prisma.harvest.findUnique({ where: { id: HARVEST_ID }, select: { id: true, name: true } });
  if (!harvest) throw new Error(`Harvest ${HARVEST_ID} not found`);
  console.log(`Harvest: ${harvest.name}\n`);

  await clearPriorAllocation();

  let pumpId = (await prisma.item.findFirst({ where: { organizationId: ORG, name: PUMP_NAME }, select: { id: true } }))?.id ?? null;

  const rows = [];
  let grandTotal = 0;

  for (const line of LINES) {
    let item;
    if (line.pump) {
      if (pumpId) item = await prisma.item.findUnique({ where: { id: pumpId }, select: { id: true, code: true, name: true, unit: true } });
      else if (DRY) item = { id: "(pump)", code: "SF00562?", name: PUMP_NAME, unit: "pcs" };
      else {
        const top = await prisma.item.findFirst({ where: { organizationId: ORG }, orderBy: { code: "desc" }, select: { code: true } });
        let next = 1;
        const m = top?.code?.match(/^SF(\d+)$/);
        if (m) next = parseInt(m[1], 10) + 1;
        item = await prisma.item.create({ data: { organizationId: ORG, code: `SF${String(next).padStart(5, "0")}`, name: PUMP_NAME, unit: "pcs" }, select: { id: true, code: true, name: true, unit: true } });
        pumpId = item.id;
      }
    } else {
      item = await prisma.item.findFirst({ where: { organizationId: ORG, code: line.code }, select: { id: true, code: true, name: true, unit: true } });
      if (!item) { console.error(`  [${line.n}] MISSING ${line.code} — skipped`); continue; }
    }

    const subFactor = line.subFactor ?? null;
    const subUnit = line.subUnit ?? null;
    const unitLabel = subUnit || item.unit;

    // Real allocated cost straight from Boyd's verified purchase table.
    const lineCost = line.costIDR;
    const perUnit = line.listQty > 0 ? lineCost / line.listQty : lineCost;
    const packQty = subFactor ? line.listQty / subFactor : line.listQty; // HarvestAsset.qty is in packs
    grandTotal += lineCost;

    rows.push({
      n: line.n, code: item.code, name: item.name.slice(0, 30),
      shows: `${line.listQty} ${unitLabel}`, perUnit, cost: lineCost, kind: line.kind,
    });

    if (DRY) continue;

    await prisma.$transaction(async (tx) => {
      // Fix the item's pack data so the quantity reads in real units app-wide.
      if (subUnit && subFactor) {
        await tx.item.update({ where: { id: item.id }, data: { subUnit, subFactor } });
      }
      const asset = await tx.harvestAsset.create({
        data: {
          organizationId: ORG, harvestId: HARVEST_ID, itemId: item.id,
          qty: packQty, date: TODAY, reusable: line.kind === "durable",
          condition: `${line.listQty} ${unitLabel} @ ${money(perUnit)}/${unitLabel}`,
          depreciable: true, amortisedCharge: lineCost, useCount: 1, maxUses: 1,
        },
        select: { id: true },
      });
      await tx.auditAction.create({
        data: {
          organizationId: ORG, type: "harvest.install_asset", entityType: "HarvestAsset",
          entityId: asset.id, description: `Allocated ${line.listQty} ${unitLabel} of ${item.name} to Test`,
          userId: null, payload: { harvestId: HARVEST_ID, assetId: asset.id, consumptionIds: [] },
        },
      });
    });
  }

  console.log("#  code      name                            shows            per-unit       line$  kind");
  console.log("-".repeat(96));
  for (const r of rows) {
    console.log([
      String(r.n).padEnd(2), r.code.padEnd(9), r.name.padEnd(31),
      r.shows.padEnd(16), money(r.perUnit).padStart(10), money(r.cost).padStart(12), r.kind,
    ].join(" "));
  }
  console.log("-".repeat(96));
  console.log(`TOTAL (Rupiah): ${money(grandTotal)}`);
  console.log(`Lines: ${rows.length}  |  ${DRY ? "DRY RUN — nothing written" : "WRITTEN (real units + per-unit prices)"}\n`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error("\nFAILED:", e.message); await prisma.$disconnect(); process.exit(1); });
