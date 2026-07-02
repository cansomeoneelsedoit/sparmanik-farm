#!/usr/bin/env node
/**
 * Add the whole-cycle nutrient usage + cost (from Melon-Nutrient-Cost_1.xlsx,
 * "Cycle Usage" sheet) to the Test harvest as REAL usage tied to the nutrient
 * inventory items.
 *
 * Each nutrient becomes a HarvestUsage on the cycle. The consumption draws the
 * item's stock down (into negative if short — Boyd accepted this) and is priced
 * at the EXACT spreadsheet Rp/kg (overriding the items' own mixed-scale batch
 * prices), so the harvest's usage cost matches the sheet to the rupiah.
 *
 *   DRY=1 node scripts/add-nutrient-usage.mjs   # preview
 *   node scripts/add-nutrient-usage.mjs         # execute
 *   FORCE=1 ...                                  # re-run after cleanup
 *
 * Delete-safe: deleting the Test harvest cascades these usages + their
 * consumptions, restoring the drawn stock.
 */

import { PrismaClient } from "@prisma/client";

const DRY = process.env.DRY === "1";
const FORCE = process.env.FORCE === "1";
const prisma = new PrismaClient();

const HARVEST_ID = "cmqn5krcx0001oc4yz4wp4oul";
const ORG = "org_sparmanik";
const TODAY = new Date();

// code → { label, kg used this cycle, price Rp/kg (from the sheet) }
const LINES = [
  { code: "SF00272", label: "Calnit", kg: 63.76, price: 24000 },
  { code: "SF00482", label: "Kalinitra (KNO3)", kg: 44.8, price: 45000 },
  { code: "SF00519", label: "Mac-S (Mag-S)", kg: 23.16, price: 16000 },
  { code: "SF00479", label: "MKP", kg: 8.73, price: 65000 },
  { code: "SF00015", label: "MAP", kg: 2.33, price: 50000 },
  { code: "SF00012", label: "SOP", kg: 2.91, price: 24000 },
  { code: "SF00484", label: "Vitaflex", kg: 2.33, price: 188000 },
  { code: "SF00040", label: "Boron Turkey", kg: 0.39, price: 80000 },
  { code: "SF00036", label: "Fe 6%", kg: 0.8, price: 271600 },
  { code: "SF00034", label: "Calsinut", kg: 8.6, price: 69825 },
  { code: "SF00033", label: "Javaigross Calcium", kg: 0.8, price: 51800 },
];

const money = (x) => Number(x).toLocaleString("id-ID", { maximumFractionDigits: 2 });

/** Draw `need` units across batches (FIFO); shortfall → newest batch (negative). */
function planDraws(withRem, need) {
  const draws = [];
  let left = need;
  for (const b of withRem) {
    if (left <= 1e-9) break;
    if (b.rem > 0) {
      const take = Math.min(b.rem, left);
      draws.push({ batchId: b.id, qty: take });
      left -= take;
    }
  }
  if (left > 1e-9) {
    const newest = withRem[withRem.length - 1];
    draws.push({ batchId: newest.id, qty: left });
  }
  return draws;
}

async function main() {
  console.log(`\n=== Add nutrient usage to Test harvest ${DRY ? "(DRY RUN)" : "(LIVE)"} ===\n`);

  // Guard against double-import.
  const marker = await prisma.auditAction.count({
    where: { type: "harvest.use_stock", payload: { path: ["source"], equals: "nutrient-cycle" } },
  });
  if (marker > 0 && !FORCE) {
    console.error(`GUARD: nutrient usage already imported (${marker} rows). Re-run with FORCE=1 to add again.`);
    process.exit(1);
  }

  const rows = [];
  let total = 0;

  for (const line of LINES) {
    const item = await prisma.item.findFirst({
      where: { organizationId: ORG, code: line.code },
      select: { id: true, name: true },
    });
    if (!item) { console.error(`  MISSING ${line.code} (${line.label})`); continue; }

    const cost = line.kg * line.price;
    total += cost;
    rows.push({ code: line.code, label: line.label, kg: line.kg, price: line.price, cost });

    if (DRY) continue;

    await prisma.$transaction(async (tx) => {
      // Current batches (FIFO) + remaining.
      const batches = await tx.batch.findMany({
        where: { itemId: item.id },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: { id: true, qty: true, consumptions: { select: { qty: true } } },
      });
      let withRem = batches.map((b) => ({
        id: b.id,
        rem: Number(b.qty) - b.consumptions.reduce((s, c) => s + Number(c.qty), 0),
      }));
      // No batch to attach to → create a 0-qty priced one (consume into negative).
      if (withRem.length === 0) {
        const b = await tx.batch.create({
          data: { organizationId: ORG, itemId: item.id, date: TODAY, qty: 0, price: line.price, exchangeRate: 1 },
          select: { id: true },
        });
        withRem = [{ id: b.id, rem: 0 }];
      }

      const usage = await tx.harvestUsage.create({
        data: {
          organizationId: ORG,
          harvestId: HARVEST_ID,
          itemId: item.id,
          qty: line.kg,
          displayQty: `${line.kg} kg — Test 1 nutrient cycle`,
          date: TODAY,
        },
        select: { id: true },
      });

      const draws = planDraws(withRem, line.kg);
      for (const dr of draws) {
        await tx.batchConsumption.create({
          data: { batchId: dr.batchId, qty: dr.qty, unitCost: line.price, harvestUsageId: usage.id },
        });
      }
      await tx.auditAction.create({
        data: {
          organizationId: ORG,
          type: "harvest.use_stock",
          entityType: "HarvestUsage",
          entityId: usage.id,
          description: `Nutrient usage: ${line.kg} kg ${line.label} @ Rp ${money(line.price)}/kg`,
          userId: null,
          payload: { harvestId: HARVEST_ID, usageId: usage.id, source: "nutrient-cycle" },
        },
      });
    });
  }

  console.log("code     nutrient              kg      Rp/kg        cost");
  console.log("-".repeat(60));
  for (const r of rows) {
    console.log([r.code.padEnd(8), r.label.padEnd(20), String(r.kg).padStart(6), money(r.price).padStart(9), money(r.cost).padStart(12)].join(" "));
  }
  console.log("-".repeat(60));
  console.log(`TOTAL nutrient usage: Rp ${money(total)}`);
  console.log(DRY ? "DRY RUN — nothing written" : "WRITTEN — usage added to Test harvest");
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error("\nFAILED:", e.message); await prisma.$disconnect(); process.exit(1); });
