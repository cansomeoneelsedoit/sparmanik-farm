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
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function userId(): Promise<string | null> {
  const s = await auth();
  return s?.user?.id ?? null;
}

const newItemSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().optional().nullable(),
  unit: z.string().min(1),
  subUnit: z.string().optional().nullable(),
  subFactor: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  reusable: z.boolean().optional().default(false),
  reorder: z.string().default("0"),
  shopeeUrl: z.string().url().optional().or(z.literal("")).nullable(),
  defaultSupplierId: z.string().optional().nullable(),
});

export async function createItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = newItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const uid = await userId();
  const item = await prisma.$transaction(async (tx: TransactionClient) => {
    const created = await tx.item.create({
      data: {
        name: parsed.data.name,
        categoryId: parsed.data.categoryId || null,
        unit: parsed.data.unit,
        subUnit: parsed.data.subUnit || null,
        subFactor: parsed.data.subFactor ? new Decimal(parsed.data.subFactor) : null,
        location: parsed.data.location || null,
        reusable: parsed.data.reusable ?? false,
        reorder: new Decimal(parsed.data.reorder),
        shopeeUrl: parsed.data.shopeeUrl || null,
        defaultSupplierId: parsed.data.defaultSupplierId || null,
      },
    });
    await recordAction(tx, {
      type: "item.create",
      entityType: "Item",
      entityId: created.id,
      description: `Added item: ${created.name}`,
      userId: uid,
      payload: { name: created.name },
    });
    return created;
  });
  revalidatePath("/inventory");
  return { ok: true, data: { id: item.id } };
}

export async function updateItem(id: string, input: unknown): Promise<ActionResult> {
  const parsed = newItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  await prisma.item.update({
    where: { id },
    data: {
      name: parsed.data.name,
      categoryId: parsed.data.categoryId || null,
      unit: parsed.data.unit,
      subUnit: parsed.data.subUnit || null,
      subFactor: parsed.data.subFactor ? new Decimal(parsed.data.subFactor) : null,
      location: parsed.data.location || null,
      reusable: parsed.data.reusable ?? false,
      reorder: new Decimal(parsed.data.reorder),
      shopeeUrl: parsed.data.shopeeUrl || null,
      defaultSupplierId: parsed.data.defaultSupplierId || null,
    },
  });
  revalidatePath("/inventory");
  revalidatePath(`/inventory/${id}`);
  return { ok: true };
}

export async function deleteBatch(id: string): Promise<ActionResult> {
  try {
    await prisma.batch.delete({ where: { id } });
  } catch {
    return { ok: false, error: "Can't delete a batch that's been consumed by harvests" };
  }
  revalidatePath("/inventory");
  return { ok: true };
}

const receiveStockSchema = z.object({
  itemId: z.string(),
  date: z.string(), // YYYY-MM-DD
  supplierId: z.string().optional().nullable(),
  qty: z.string(),
  price: z.string(),
  exchangeRate: z.string(),
});

export async function receiveStock(input: unknown): Promise<ActionResult<{ batchId: string }>> {
  const parsed = receiveStockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const uid = await userId();
  const result = await prisma.$transaction(async (tx: TransactionClient) => {
    const batch = await tx.batch.create({
      data: {
        itemId: parsed.data.itemId,
        date: new Date(parsed.data.date),
        supplierId: parsed.data.supplierId || null,
        qty: new Decimal(parsed.data.qty),
        price: new Decimal(parsed.data.price),
        exchangeRate: new Decimal(parsed.data.exchangeRate),
      },
      include: { item: { select: { name: true } } },
    });
    await recordAction(tx, {
      type: "inventory.receive_stock",
      entityType: "Batch",
      entityId: batch.id,
      description: `Received ${parsed.data.qty} of ${batch.item.name}`,
      userId: uid,
      payload: { batchId: batch.id, itemId: batch.itemId, qty: parsed.data.qty },
    });
    return batch;
  });
  revalidatePath("/inventory");
  revalidatePath(`/inventory/${parsed.data.itemId}`);
  return { ok: true, data: { batchId: result.id } };
}

const useStockSchema = z.object({
  itemId: z.string(),
  qty: z.string(),
});

export async function consumeItem(input: unknown): Promise<ActionResult<{ actionId: string }>> {
  const parsed = useStockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const uid = await userId();
  try {
    const result = await prisma.$transaction(async (tx: TransactionClient) => {
      const item = await tx.item.findUnique({ where: { id: parsed.data.itemId }, select: { name: true } });
      if (!item) throw new Error("Item not found");

      const { consumed, totalCost } = await consumeFifo(tx, parsed.data.itemId, parsed.data.qty);

      // Create a synthetic "ad-hoc usage" — for now, just BatchConsumption rows
      // not linked to a harvest. We model them by leaving harvestUsageId null
      // and using the audit payload to identify the group.
      const created: { id: string }[] = [];
      for (const c of consumed) {
        const row = await tx.batchConsumption.create({
          data: { batchId: c.batchId, qty: new Decimal(c.qty), unitCost: new Decimal(c.unitCost) },
        });
        created.push({ id: row.id });
      }

      const action = await recordAction(tx, {
        type: "inventory.use_stock",
        entityType: "Item",
        entityId: parsed.data.itemId,
        description: `Used ${parsed.data.qty} of ${item.name}`,
        userId: uid,
        payload: { itemId: parsed.data.itemId, qty: parsed.data.qty, totalCost, consumptionIds: created.map((c) => c.id) },
      });
      return action;
    });
    revalidatePath("/inventory");
    revalidatePath(`/inventory/${parsed.data.itemId}`);
    return { ok: true, data: { actionId: result.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to use stock" };
  }
}

export async function deleteItem(id: string): Promise<ActionResult> {
  const uid = await userId();
  await prisma.$transaction(async (tx: TransactionClient) => {
    const item = await tx.item.findUnique({ where: { id } });
    if (!item) throw new Error("Item not found");
    await tx.item.delete({ where: { id } });
    await recordAction(tx, {
      type: "item.delete",
      entityType: "Item",
      entityId: id,
      description: `Deleted item: ${item.name}`,
      userId: uid,
      payload: item,
    });
  });
  revalidatePath("/inventory");
  return { ok: true };
}
