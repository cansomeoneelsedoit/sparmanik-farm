"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { recordAction } from "@/server/audit";
import { consumeFifo } from "@/server/fifo";
import { Decimal, type TransactionClient } from "@/server/decimal";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function uid() {
  return (await auth())?.user?.id ?? null;
}

const startSchema = z.object({
  greenhouseId: z.string().min(1),
  // Legacy single-produce field — kept as the "primary" for backward compat.
  produceId: z.string().optional().nullable(),
  // New multi-produce field. If provided, replaces the join table content.
  // When both are present, produceIds wins; produceId is overwritten to the
  // first element so old reports still work.
  produceIds: z.array(z.string()).optional(),
  name: z.string().min(1),
  variety: z.string().optional().default(""),
  startDate: z.string().min(1),
});

export async function startHarvest(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  const ids = parsed.data.produceIds ?? (parsed.data.produceId ? [parsed.data.produceId] : []);
  const primary = ids[0] ?? null;
  const h = await prisma.$transaction(async (tx: TransactionClient) => {
    const created = await tx.harvest.create({
      data: {
        greenhouseId: parsed.data.greenhouseId,
        produceId: primary,
        name: parsed.data.name,
        variety: parsed.data.variety || null,
        startDate: new Date(parsed.data.startDate),
        status: "LIVE",
      },
    });
    if (ids.length > 0) {
      await tx.harvestProduce.createMany({
        data: ids.map((produceId) => ({ harvestId: created.id, produceId })),
        skipDuplicates: true,
      });
    }
    await recordAction(tx, {
      type: "harvest.start",
      entityType: "Harvest",
      entityId: created.id,
      description: `Started harvest: ${created.name}`,
      userId,
      payload: { produceIds: ids },
    });
    return created;
  });
  revalidatePath("/harvest");
  return { ok: true, data: { id: h.id } };
}

const updateHarvestSchema = z.object({
  name: z.string().min(1),
  variety: z.string().optional().default(""),
  greenhouseId: z.string().min(1),
  produceId: z.string().optional().nullable(),
  produceIds: z.array(z.string()).optional(),
  startDate: z.string().min(1),
  endDate: z.string().optional().nullable(),
  status: z.enum(["LIVE", "CLOSED"]).default("LIVE"),
});

export async function updateHarvest(id: string, input: unknown): Promise<ActionResult> {
  const parsed = updateHarvestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const ids = parsed.data.produceIds ?? (parsed.data.produceId ? [parsed.data.produceId] : []);
  const primary = ids[0] ?? null;
  await prisma.$transaction(async (tx: TransactionClient) => {
    await tx.harvest.update({
      where: { id },
      data: {
        name: parsed.data.name,
        variety: parsed.data.variety || null,
        greenhouseId: parsed.data.greenhouseId,
        produceId: primary,
        startDate: new Date(parsed.data.startDate),
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
        status: parsed.data.status,
      },
    });
    // Replace the join table contents wholesale.
    if (parsed.data.produceIds !== undefined) {
      await tx.harvestProduce.deleteMany({ where: { harvestId: id } });
      if (ids.length > 0) {
        await tx.harvestProduce.createMany({
          data: ids.map((produceId) => ({ harvestId: id, produceId })),
          skipDuplicates: true,
        });
      }
    }
  });
  revalidatePath("/harvest");
  revalidatePath(`/harvest/${id}`);
  return { ok: true };
}

export async function deleteHarvest(id: string): Promise<ActionResult> {
  await prisma.harvest.delete({ where: { id } });
  revalidatePath("/harvest");
  return { ok: true };
}

export async function deleteSale(id: string): Promise<ActionResult> {
  const sale = await prisma.sale.findUnique({ where: { id }, select: { harvestId: true } });
  await prisma.sale.delete({ where: { id } });
  if (sale?.harvestId) revalidatePath(`/harvest/${sale.harvestId}`);
  revalidatePath("/sales");
  return { ok: true };
}

const updateSaleSchema = z.object({
  produceId: z.string(),
  date: z.string(),
  grade: z.enum(["A", "B", "C", "D"]),
  weight: z.string(),
  pricePerKg: z.string(),
});

export async function updateSale(id: string, input: unknown): Promise<ActionResult> {
  const parsed = updateSaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const weight = new Decimal(parsed.data.weight);
  const price = new Decimal(parsed.data.pricePerKg);
  const sale = await prisma.sale.update({
    where: { id },
    data: {
      produceId: parsed.data.produceId,
      date: new Date(parsed.data.date),
      grade: parsed.data.grade,
      weight,
      pricePerKg: price,
      amount: weight.times(price),
    },
  });
  revalidatePath(`/harvest/${sale.harvestId}`);
  revalidatePath("/sales");
  return { ok: true };
}

export async function deleteHarvestUsage(id: string): Promise<ActionResult> {
  const usage = await prisma.harvestUsage.findUnique({ where: { id }, select: { harvestId: true } });
  await prisma.harvestUsage.delete({ where: { id } });
  if (usage?.harvestId) revalidatePath(`/harvest/${usage.harvestId}`);
  return { ok: true };
}

export async function deleteHarvestAsset(id: string): Promise<ActionResult> {
  const asset = await prisma.harvestAsset.findUnique({ where: { id }, select: { harvestId: true } });
  await prisma.harvestAsset.delete({ where: { id } });
  if (asset?.harvestId) revalidatePath(`/harvest/${asset.harvestId}`);
  return { ok: true };
}

/**
 * Delete a single labour line (one WageEntryLine) without touching the
 * other lines on the same WageEntry. The wage entry itself stays — it's
 * possible to have a day with hours allocated to other harvests or to
 * general farm work, and removing one allocation shouldn't blow away
 * the staff member's whole day.
 */
export async function deleteLabourLine(id: string): Promise<ActionResult> {
  const line = await prisma.wageEntryLine.findUnique({
    where: { id },
    select: { harvestId: true },
  });
  if (!line) return { ok: false, error: "Labour line not found" };
  await prisma.wageEntryLine.delete({ where: { id } });
  if (line.harvestId) revalidatePath(`/harvest/${line.harvestId}`);
  // Wages also feed Financials and the staff page.
  revalidatePath("/financials");
  revalidatePath("/staff");
  return { ok: true };
}

// Shared types used by endHarvest + checkInHarvestAsset.
type ConsumptionWithBatch = {
  id: string;
  qty: Decimal;
  batch: {
    id: string;
    itemId: string;
    supplierId: string | null;
    exchangeRate: Decimal;
    maxUses: number;
    useCount: number;
    amortisedCostPerUse: Decimal | null;
  };
};
type AssetRowForReturn = {
  id: string;
  depreciable: boolean;
  consumptions: ConsumptionWithBatch[];
};

/**
 * For each consumption slice of an asset, either return it to inventory as a
 * `returned=true, price=0` batch (preserving the amortisation schedule) or
 * mark it as discarded if all uses are spent. Shared by `checkInHarvestAsset`
 * (condition=good) and the legacy end-harvest auto-good path.
 */
async function returnAssetSlicesToInventory(
  tx: TransactionClient,
  asset: AssetRowForReturn,
  whenDate: Date,
  summary: { returned: number; discarded: number },
) {
  let anyDiscarded = false;
  let allDiscarded = asset.consumptions.length > 0;
  for (const c of asset.consumptions) {
    const b = c.batch;
    if (b.useCount < b.maxUses) {
      await tx.batch.create({
        data: {
          itemId: b.itemId,
          supplierId: b.supplierId,
          date: whenDate,
          qty: new Decimal(c.qty),
          price: new Decimal(0),
          exchangeRate: b.exchangeRate,
          maxUses: b.maxUses,
          useCount: b.useCount,
          amortisedCostPerUse: b.amortisedCostPerUse,
          returned: true,
        },
      });
      summary.returned += Number(c.qty);
      allDiscarded = false;
    } else {
      anyDiscarded = true;
      summary.discarded += Number(c.qty);
    }
  }
  if (allDiscarded || anyDiscarded) {
    await tx.harvestAsset.update({
      where: { id: asset.id },
      data: { discarded: allDiscarded },
    });
  }
}

const checkInSchema = z.object({
  harvestAssetId: z.string().min(1),
  condition: z.enum(["good", "damaged", "lost"]),
  /** Quantity actually USED, in PACK units (the dialog converts from the
   *  item's real unit — metres/pcs/grams/kg). When present, the lightweight
   *  path runs: charge only the used amount to the harvest, no stock return. */
  usedQty: z.string().optional(),
  /** Human "30 metres" string for the audit log / note. */
  usedDisplay: z.string().optional().default(""),
  date: z.string().min(1),
  note: z.string().optional().default(""),
});

/**
 * Mid-harvest check-in for a reusable asset.
 *   - good     → return slices to inventory (same code path as end-harvest)
 *   - damaged  → don't return; mark source batches' damagedFromHarvestId so
 *                Financials can attribute the write-off; residual depreciable
 *                value stays on the business books (no recovery)
 *   - lost     → same as damaged
 * In all cases `returnCondition` / `returnedAt` / `returnNote` are stamped on
 * the HarvestAsset so endHarvest can skip it.
 */
export async function checkInHarvestAsset(input: unknown): Promise<ActionResult> {
  const parsed = checkInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  const when = new Date(parsed.data.date);
  const summary = { returned: 0, discarded: 0 };

  try {
    const harvestId = await prisma.$transaction(async (tx: TransactionClient) => {
      const asset = (await tx.harvestAsset.findUnique({
        where: { id: parsed.data.harvestAssetId },
        include: {
          consumptions: {
            include: {
              batch: {
                select: {
                  id: true,
                  itemId: true,
                  supplierId: true,
                  exchangeRate: true,
                  maxUses: true,
                  useCount: true,
                  amortisedCostPerUse: true,
                },
              },
            },
          },
        },
      })) as
        | (AssetRowForReturn & {
            harvestId: string;
            returnCondition: string | null;
            qty: Decimal;
            amortisedCharge: Decimal | null;
          })
        | null;
      if (!asset) throw new Error("Asset not found");
      if (asset.returnCondition) {
        throw new Error(`Asset already checked in (${asset.returnCondition})`);
      }

      // --- Lightweight path (Boyd's "option 3") -------------------------
      // Staff entered how much was actually USED (in real units → packs).
      // Charge only that to the harvest by scaling amortisedCharge down
      // proportionally; record the used qty. No stock return, no batch
      // changes. (A proper partial-return version comes later.)
      if (parsed.data.usedQty !== undefined) {
        const usedPacks = new Decimal(parsed.data.usedQty);
        const installedPacks = new Decimal(asset.qty);
        const origCharge = asset.amortisedCharge
          ? new Decimal(asset.amortisedCharge)
          : new Decimal(0);
        const perPack = installedPacks.gt(0)
          ? origCharge.div(installedPacks)
          : new Decimal(0);
        const newCharge = usedPacks.times(perPack);

        await tx.harvestAsset.update({
          where: { id: asset.id },
          data: {
            qty: usedPacks,
            depreciable: true, // keep the (now used-only) cost in the harvest P&L
            amortisedCharge: newCharge,
            returnCondition: parsed.data.condition,
            returnedAt: when,
            returnNote:
              [parsed.data.note, `used ${parsed.data.usedDisplay}`]
                .filter(Boolean)
                .join(" — ") || null,
          },
        });

        await recordAction(tx, {
          type: "harvest.checkin_asset",
          entityType: "HarvestAsset",
          entityId: asset.id,
          description: `Checked in ${parsed.data.usedDisplay || "asset"} used (${parsed.data.condition})`,
          userId,
          payload: {
            harvestAssetId: asset.id,
            harvestId: asset.harvestId,
            condition: parsed.data.condition,
            usedQty: parsed.data.usedQty,
            usedDisplay: parsed.data.usedDisplay,
            note: parsed.data.note,
          },
        });

        return asset.harvestId;
      }

      if (parsed.data.condition === "good") {
        await returnAssetSlicesToInventory(tx, asset, when, summary);
      } else {
        // Damaged or Lost — link each source batch back to this harvest so the
        // Financials damage-loss line can show what broke where. Don't create
        // a returned batch.
        for (const c of asset.consumptions) {
          await tx.batch.update({
            where: { id: c.batch.id },
            data: { damagedFromHarvestId: asset.harvestId },
          });
        }
      }

      await tx.harvestAsset.update({
        where: { id: asset.id },
        data: {
          returnCondition: parsed.data.condition,
          returnedAt: when,
          returnNote: parsed.data.note || null,
        },
      });

      await recordAction(tx, {
        type:
          parsed.data.condition === "good"
            ? "harvest.checkin_asset"
            : "harvest.damage_asset",
        entityType: "HarvestAsset",
        entityId: asset.id,
        description:
          parsed.data.condition === "good"
            ? `Checked in asset (good): ${summary.returned} units returned`
            : `Asset ${parsed.data.condition}: ${parsed.data.note || "no note"}`,
        userId,
        payload: {
          harvestAssetId: asset.id,
          harvestId: asset.harvestId,
          condition: parsed.data.condition,
          summary,
          note: parsed.data.note,
        },
      });

      return asset.harvestId;
    });

    revalidatePath(`/harvest/${harvestId}`);
    revalidatePath("/inventory");
    revalidatePath("/financials");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to check in" };
  }
}

export async function endHarvest(harvestId: string): Promise<ActionResult> {
  const userId = await uid();
  const summary: { returned: number; discarded: number } = { returned: 0, discarded: 0 };
  await prisma.$transaction(async (tx: TransactionClient) => {
    const h = await tx.harvest.findUnique({ where: { id: harvestId } });
    if (!h) throw new Error("Harvest not found");

    // Auto-good every depreciable HarvestAsset that hasn't already been
    // checked in manually. Anything with returnCondition set (good/damaged
    // /lost) was handled by checkInHarvestAsset — skip it.
    const assets = (await tx.harvestAsset.findMany({
      where: { harvestId, depreciable: true, returnCondition: null },
      include: {
        consumptions: {
          include: {
            batch: {
              select: {
                id: true,
                itemId: true,
                supplierId: true,
                exchangeRate: true,
                maxUses: true,
                useCount: true,
                amortisedCostPerUse: true,
              },
            },
          },
        },
      },
    })) as AssetRowForReturn[];

    const today = new Date();
    for (const asset of assets) {
      await returnAssetSlicesToInventory(tx, asset, today, summary);
      await tx.harvestAsset.update({
        where: { id: asset.id },
        data: { returnCondition: "good", returnedAt: today },
      });
    }

    await tx.harvest.update({
      where: { id: harvestId },
      data: { status: "CLOSED", endDate: today },
    });
    await recordAction(tx, {
      type: "harvest.end",
      entityType: "Harvest",
      entityId: harvestId,
      description: `Ended harvest: ${h.name}`,
      userId,
      payload: {
        name: h.name,
        depreciation: summary,
      },
    });
  });
  revalidatePath("/harvest");
  revalidatePath(`/harvest/${harvestId}`);
  revalidatePath("/inventory");
  revalidatePath("/financials");
  return { ok: true };
}

const useSchema = z.object({
  harvestId: z.string(),
  itemId: z.string(),
  qty: z.string(),
  displayQty: z.string().optional().default(""),
  date: z.string(),
});

export async function recordHarvestUsage(input: unknown): Promise<ActionResult> {
  const parsed = useSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      const usage = await tx.harvestUsage.create({
        data: {
          harvestId: parsed.data.harvestId,
          itemId: parsed.data.itemId,
          qty: new Decimal(parsed.data.qty),
          displayQty: parsed.data.displayQty || null,
          date: new Date(parsed.data.date),
        },
      });
      const { consumed } = await consumeFifo(tx, parsed.data.itemId, parsed.data.qty);
      const consumptionIds: string[] = [];
      for (const c of consumed) {
        const cc = await tx.batchConsumption.create({
          data: {
            batchId: c.batchId,
            qty: new Decimal(c.qty),
            unitCost: new Decimal(c.unitCost),
            harvestUsageId: usage.id,
          },
        });
        consumptionIds.push(cc.id);
      }
      await recordAction(tx, {
        type: "harvest.use_stock",
        entityType: "HarvestUsage",
        entityId: usage.id,
        description: `Recorded usage on harvest`,
        userId,
        payload: { harvestId: parsed.data.harvestId, usageId: usage.id, consumptionIds },
      });
    });
    revalidatePath(`/harvest/${parsed.data.harvestId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

const installSchema = z.object({
  harvestId: z.string(),
  itemId: z.string(),
  qty: z.string(),
  date: z.string(),
  reusable: z.boolean().default(false),
  condition: z.string().optional().default(""),
});

export async function installHarvestAsset(input: unknown): Promise<ActionResult> {
  const parsed = installSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      const { consumed } = await consumeFifo(tx, parsed.data.itemId, parsed.data.qty);

      // --- Depreciation snapshot ---
      // depreciable = true if ANY consumed slice came from a maxUses>1 batch.
      // amortisedCharge sums the per-slice contribution (qty * batch.amortisedCostPerUse).
      // useCount/maxUses snapshot from the most-used source batch for display ("use N of M").
      let depreciable = false;
      let amortisedCharge = new Decimal(0);
      let snapshotUseCount = 0;
      let snapshotMaxUses = 1;
      for (const c of consumed) {
        if (c.batchMaxUses > 1 && c.amortisedCostPerUse) {
          depreciable = true;
          amortisedCharge = amortisedCharge.plus(
            new Decimal(c.qty).times(c.amortisedCostPerUse),
          );
          const next = c.batchUseCountBefore + 1;
          if (next > snapshotUseCount) {
            snapshotUseCount = next;
            snapshotMaxUses = c.batchMaxUses;
          }
        }
      }

      const asset = await tx.harvestAsset.create({
        data: {
          harvestId: parsed.data.harvestId,
          itemId: parsed.data.itemId,
          qty: new Decimal(parsed.data.qty),
          date: new Date(parsed.data.date),
          reusable: parsed.data.reusable,
          condition: parsed.data.condition || null,
          depreciable,
          amortisedCharge: depreciable ? amortisedCharge : null,
          useCount: snapshotUseCount,
          maxUses: snapshotMaxUses,
        },
      });
      const consumptionIds: string[] = [];
      const touchedBatchIds = new Set<string>();
      for (const c of consumed) {
        const cc = await tx.batchConsumption.create({
          data: {
            batchId: c.batchId,
            qty: new Decimal(c.qty),
            unitCost: new Decimal(c.unitCost),
            harvestAssetId: asset.id,
          },
        });
        consumptionIds.push(cc.id);
        // Increment useCount once per source batch so a 5+5 split across two
        // depreciable batches counts as one "use" for each batch.
        if (c.batchMaxUses > 1 && !touchedBatchIds.has(c.batchId)) {
          touchedBatchIds.add(c.batchId);
          await tx.batch.update({
            where: { id: c.batchId },
            data: { useCount: { increment: 1 } },
          });
        }
      }
      await recordAction(tx, {
        type: "harvest.install_asset",
        entityType: "HarvestAsset",
        entityId: asset.id,
        description: `Installed asset on harvest`,
        userId,
        payload: { harvestId: parsed.data.harvestId, assetId: asset.id, consumptionIds },
      });
    });
    revalidatePath(`/harvest/${parsed.data.harvestId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

const saleSchema = z.object({
  harvestId: z.string(),
  produceId: z.string(),
  date: z.string(),
  grade: z.enum(["A", "B", "C", "D"]),
  weight: z.string(),
  pricePerKg: z.string(),
  /** Optional buyer. Null = walk-up / untracked sale. */
  customerId: z.string().optional(),
  /** Optional packaging (a box/bag/container item). When set, the item is
   *  consumed from stock onto the cycle's usage at FIFO cost. */
  packagingItemId: z.string().optional(),
  packagingQty: z.string().optional(),
  /** "included" → packaging is a cost only (sale total unchanged).
   *  "ontop"    → packagingChargePerUnit × qty is added to the sale total. */
  packagingMode: z.enum(["included", "ontop"]).optional(),
  /** What the customer pays per packaging unit when mode = "ontop"
   *  (defaults to cost on the client, but editable). */
  packagingChargePerUnit: z.string().optional(),
});

export async function logSale(input: unknown): Promise<ActionResult> {
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  const d = parsed.data;
  const hasPackaging = !!(d.packagingItemId && d.packagingQty && Number(d.packagingQty) > 0);
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      const weight = new Decimal(d.weight);
      const price = new Decimal(d.pricePerKg);
      let amount = weight.times(price);

      // Packaging charged "on top" adds to the sale total (revenue).
      if (hasPackaging && d.packagingMode === "ontop") {
        const charge = new Decimal(d.packagingChargePerUnit || "0").times(d.packagingQty as string);
        amount = amount.plus(charge);
      }

      const sale = await tx.sale.create({
        data: {
          harvestId: d.harvestId,
          produceId: d.produceId,
          date: new Date(d.date),
          grade: d.grade,
          weight,
          pricePerKg: price,
          amount,
          customerId: d.customerId || null,
        },
      });
      await recordAction(tx, {
        type: "harvest.log_sale",
        entityType: "Sale",
        entityId: sale.id,
        description: `Logged sale`,
        userId,
        payload: { harvestId: d.harvestId, saleId: sale.id, customerId: d.customerId ?? null },
      });

      // Consume the packaging from inventory onto this cycle's usage (FIFO
      // cost). This is the real cost; the on-top charge above is the revenue.
      if (hasPackaging) {
        const { consumed } = await consumeFifo(tx, d.packagingItemId as string, d.packagingQty as string);
        const usage = await tx.harvestUsage.create({
          data: {
            harvestId: d.harvestId,
            itemId: d.packagingItemId as string,
            qty: new Decimal(d.packagingQty as string),
            displayQty: `${d.packagingQty} for sale packaging`,
            date: new Date(d.date),
          },
        });
        for (const c of consumed) {
          await tx.batchConsumption.create({
            data: {
              batchId: c.batchId,
              qty: new Decimal(c.qty),
              unitCost: new Decimal(c.unitCost),
              harvestUsageId: usage.id,
            },
          });
        }
        await recordAction(tx, {
          type: "harvest.use_stock",
          entityType: "HarvestUsage",
          entityId: usage.id,
          description: `Packaging used for sale`,
          userId,
          payload: { harvestId: d.harvestId, usageId: usage.id, viaSale: sale.id },
        });
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to log sale" };
  }
  revalidatePath(`/harvest/${d.harvestId}`);
  revalidatePath("/sales");
  return { ok: true };
}

// ============================================================================
// Customers (who we sell to) — mirror of supplier quick-create. Search-first,
// create ad-hoc from the Log-sale dialog. Type drives later reporting.
// ============================================================================

const CUSTOMER_TYPES = ["RETAILER", "WHOLESALER", "CONSUMER"] as const;

const createCustomerSchema = z.object({
  name: z.string().min(1),
  type: z.enum(CUSTOMER_TYPES).default("CONSUMER"),
});

export async function createCustomerQuick(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string; type: string }>> {
  const parsed = createCustomerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Name is required" };
  const trimmed = parsed.data.name.trim();
  if (!trimmed) return { ok: false, error: "Name is required" };
  const userId = await uid();
  try {
    const customer = await prisma.$transaction(async (tx: TransactionClient) => {
      const created = await tx.customer.create({
        data: { name: trimmed, type: parsed.data.type },
      });
      await recordAction(tx, {
        type: "customer.create",
        entityType: "Customer",
        entityId: created.id,
        description: `Added customer (quick): ${trimmed} (${parsed.data.type.toLowerCase()})`,
        userId,
        payload: { name: trimmed, type: parsed.data.type, source: "quick" },
      });
      return created;
    });
    revalidatePath("/sales");
    return { ok: true, data: { id: customer.id, name: customer.name, type: customer.type } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create customer" };
  }
}

/** All customers for the active org — drives the Log-sale picker. */
export async function listCustomers(): Promise<
  { id: string; name: string; type: string }[]
> {
  const rows = (await prisma.customer.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true },
  })) as { id: string; name: string; type: string }[];
  return rows;
}
