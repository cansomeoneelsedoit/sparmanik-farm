"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { recordAction } from "@/server/audit";
import { consumeFifo } from "@/server/fifo";
import { Decimal } from "@/server/decimal";

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
  const h = await prisma.$transaction(async (tx: typeof prisma) => {
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

export async function endHarvest(harvestId: string): Promise<ActionResult> {
  const userId = await uid();
  await prisma.$transaction(async (tx: typeof prisma) => {
    const h = await tx.harvest.findUnique({ where: { id: harvestId } });
    if (!h) throw new Error("Harvest not found");
    await tx.harvest.update({
      where: { id: harvestId },
      data: { status: "CLOSED", endDate: new Date() },
    });
    await recordAction(tx, {
      type: "harvest.end",
      entityType: "Harvest",
      entityId: harvestId,
      description: `Ended harvest: ${h.name}`,
      userId,
      payload: { name: h.name },
    });
  });
  revalidatePath("/harvest");
  revalidatePath(`/harvest/${harvestId}`);
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
    await prisma.$transaction(async (tx: typeof prisma) => {
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
    await prisma.$transaction(async (tx: typeof prisma) => {
      const asset = await tx.harvestAsset.create({
        data: {
          harvestId: parsed.data.harvestId,
          itemId: parsed.data.itemId,
          qty: new Decimal(parsed.data.qty),
          date: new Date(parsed.data.date),
          reusable: parsed.data.reusable,
          condition: parsed.data.condition || null,
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
            harvestAssetId: asset.id,
          },
        });
        consumptionIds.push(cc.id);
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
  await prisma.$transaction(async (tx: typeof prisma) => {
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
