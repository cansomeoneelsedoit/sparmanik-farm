/**
 * Log the melon SEED cost for the Metal Greenhouse cycle (Jul 30 2026, HST 0).
 * Boyd: 500-seed pack = Rp 2,500,000 → Rp 5,000/seed. Planted 960 seeds:
 *   Yellow Kirin Kevin 430 · White Kirin Kevin 172 · Sparmanik Manis Candy 172
 *   · Yellow Kirin Australia F3 86 · Dalmation 100
 *
 * Creates (once) an item "Melon seeds — 500-seed pack" with a 2-pack batch,
 * then one usage row per variety on the cycle at FIFO cost. Idempotent.
 *
 * Run against LOCAL (default, uses DATABASE_URL in the container):
 *   docker compose exec web node scripts/seed-cost-metal-aug2026.mjs
 * Run against PROD (Boyd only — paste the Railway public URL, it never leaves your terminal):
 *   set DATABASE_URL=postgresql://...   (cmd)   or   $env:DATABASE_URL="postgresql://..." (PowerShell)
 *   node scripts/seed-cost-metal-aug2026.mjs
 */
import { PrismaClient } from "@prisma/client";

const ORG = "org_sparmanik";
const HARVEST = "cmsyrzrqt0005ln4e1tz61q9m";
const HST0 = new Date("2026-07-30T00:00:00Z");
const PACK_SEEDS = 500;
const PACK_PRICE = 2_500_000;
const PLANTED = [
  ["Yellow Kirin Kevin", 430],
  ["White Kirin Kevin", 172],
  ["Sparmanik Manis Candy", 172],
  ["Yellow Kirin Australia F3", 86],
  ["Dalmation", 100],
];

const p = new PrismaClient();
async function main() {
  const h = await p.harvest.findUnique({ where: { id: HARVEST }, select: { id: true, name: true } });
  if (!h) throw new Error("Harvest not found — is this the right database?");

  let item = await p.item.findFirst({ where: { organizationId: ORG, name: { startsWith: "Melon seeds — 500-seed pack" } } });
  if (!item) {
    const top = await p.item.findFirst({ where: { organizationId: ORG, code: { startsWith: "SF" } }, orderBy: { code: "desc" }, select: { code: true } });
    const m = top?.code.match(/^SF(\d+)$/);
    const code = `SF${String((m ? parseInt(m[1], 10) : 0) + 1).padStart(5, "0")}`;
    item = await p.item.create({
      data: {
        organizationId: ORG,
        code,
        name: "Melon seeds — 500-seed pack (Benih melon, isi 500)",
        nameEn: "Melon seeds — 500-seed pack",
        unit: "pcs",
        subUnit: "seeds",
        subFactor: PACK_SEEDS,
      },
    });
    console.log("created item", item.id, code);
  }
  const totalSeeds = PLANTED.reduce((s, [, n]) => s + n, 0);
  const packsNeeded = Math.ceil(totalSeeds / PACK_SEEDS);
  const batches = await p.batch.count({ where: { itemId: item.id } });
  if (batches === 0) {
    await p.batch.create({ data: { organizationId: ORG, itemId: item.id, date: new Date("2026-07-15T00:00:00Z"), qty: packsNeeded, price: PACK_PRICE, exchangeRate: 1 } });
    console.log(`added batch ${packsNeeded} × Rp ${PACK_PRICE.toLocaleString("id-ID")}`);
  }
  const already = await p.harvestUsage.count({ where: { harvestId: HARVEST, itemId: item.id } });
  if (already) { console.log("seed usage already logged — nothing to do"); return; }
  const batch = await p.batch.findFirst({ where: { itemId: item.id }, orderBy: { date: "asc" } });
  let cost = 0;
  for (const [variety, seeds] of PLANTED) {
    const qty = seeds / PACK_SEEDS; // packs
    await p.$transaction(async (tx) => {
      const u = await tx.harvestUsage.create({ data: { organizationId: ORG, harvestId: HARVEST, itemId: item.id, qty, displayQty: `${seeds} seeds — ${variety}`, date: HST0 } });
      await tx.batchConsumption.create({ data: { batchId: batch.id, qty, unitCost: batch.price, harvestUsageId: u.id } });
      await tx.auditAction.create({ data: { organizationId: ORG, type: "harvest.use_stock", entityType: "HarvestUsage", entityId: u.id, description: `Seeds: ${seeds} × ${variety} @ Rp ${PACK_PRICE / PACK_SEEDS}/seed`, payload: { harvestId: HARVEST, usageId: u.id, variety, seeds } } });
    });
    cost += qty * Number(batch.price);
    console.log(`  ${variety}: ${seeds} seeds → Rp ${(seeds * PACK_PRICE / PACK_SEEDS).toLocaleString("id-ID")}`);
  }
  console.log(`seed cost total Rp ${cost.toLocaleString("id-ID")} on "${h.name}"`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
