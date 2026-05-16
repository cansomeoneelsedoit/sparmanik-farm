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
  produceId: z.string().optional().nullable(),
  name: z.string().min(1),
  variety: z.string().optional().default(""),
  startDate: z.string().min(1),
});

export async function startHarvest(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  const h = await prisma.$transaction(async (tx: TransactionClient) => {
    const created = await tx.harvest.create({
      data: {
        greenhouseId: parsed.data.greenhouseId,
        produceId: parsed.data.produceId || null,
        name: parsed.data.name,
        variety: parsed.data.variety || null,
        startDate: new Date(parsed.data.startDate),
        status: "LIVE",
      },
    });
    await recordAction(tx, {
      type: "harvest.start",
      entityType: "Harvest",
      entityId: created.id,
      description: `Started harvest: ${created.name}`,
      userId,
      payload: {},
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
  startDate: z.string().min(1),
  endDate: z.string().optional().nullable(),
  status: z.enum(["LIVE", "CLOSED"]).default("LIVE"),
});

export async function updateHarvest(id: string, input: unknown): Promise<ActionResult> {
  const parsed = updateHarvestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  await prisma.harvest.update({
    where: { id },
    data: {
      name: parsed.data.name,
      variety: parsed.data.variety || null,
      greenhouseId: parsed.data.greenhouseId,
      produceId: parsed.data.produceId || null,
      startDate: new Date(parsed.data.startDate),
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      status: parsed.data.status,
    },
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

export async function endHarvest(harvestId: string): Promise<ActionResult> {
  const userId = await uid();
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
  type AssetRow = {
    id: string;
    depreciable: boolean;
    consumptions: ConsumptionWithBatch[];
  };
  const summary: { returned: number; discarded: number } = { returned: 0, discarded: 0 };
  await prisma.$transaction(async (tx: TransactionClient) => {
    const h = await tx.harvest.findUnique({ where: { id: harvestId } });
    if (!h) throw new Error("Harvest not found");

    // --- Depreciable asset lifecycle ---
    // For each depreciable HarvestAsset on this harvest, look at its source
    // BatchConsumption rows. For each source batch:
    //   - if useCount < maxUses → return as a new zero-cost batch (price=0,
    //     same maxUses/useCount/amortisedCostPerUse, returned=true).
    //   - if useCount >= maxUses → don't return; the asset gets discarded=true.
    const assets = (await tx.harvestAsset.findMany({
      where: { harvestId, depreciable: true },
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
    })) as AssetRow[];

    const today = new Date();
    for (const asset of assets) {
      let anyDiscarded = false;
      let allDiscarded = asset.consumptions.length > 0;
      for (const c of asset.consumptions) {
        const b = c.batch;
        if (b.useCount < b.maxUses) {
          // Return this slice as a new zero-cost batch — preserves the
          // amortisation schedule so future harvests still get charged a fair
          // share, even though no further cash leaves the business.
          await tx.batch.create({
            data: {
              itemId: b.itemId,
              supplierId: b.supplierId,
              date: today,
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
});

export async function logSale(input: unknown): Promise<ActionResult> {
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  await prisma.$transaction(async (tx: TransactionClient) => {
    const weight = new Decimal(parsed.data.weight);
    const price = new Decimal(parsed.data.pricePerKg);
    const sale = await tx.sale.create({
      data: {
        harvestId: parsed.data.harvestId,
        produceId: parsed.data.produceId,
        date: new Date(parsed.data.date),
        grade: parsed.data.grade,
        weight,
        pricePerKg: price,
        amount: weight.times(price),
      },
    });
    await recordAction(tx, {
      type: "harvest.log_sale",
      entityType: "Sale",
      entityId: sale.id,
      description: `Logged sale`,
      userId,
      payload: { harvestId: parsed.data.harvestId, saleId: sale.id },
    });
  });
  revalidatePath(`/harvest/${parsed.data.harvestId}`);
  revalidatePath("/sales");
  return { ok: true };
}
