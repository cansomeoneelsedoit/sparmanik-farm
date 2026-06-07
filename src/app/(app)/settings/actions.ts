"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { Decimal, type TransactionClient } from "@/server/decimal";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

// ---- Categories ----
const catSchema = z.object({ name: z.string().min(1) });

export async function addCategory(input: unknown): Promise<ActionResult> {
  const parsed = catSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid name" };
  try {
    await prisma.category.create({ data: { name: parsed.data.name } });
  } catch {
    return { ok: false, error: "Category exists" };
  }
  revalidatePath("/settings/categories");
  return { ok: true };
}

export async function updateCategory(id: string, input: unknown): Promise<ActionResult> {
  const parsed = catSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid name" };
  try {
    await prisma.category.update({ where: { id }, data: { name: parsed.data.name } });
  } catch {
    return { ok: false, error: "Name already exists" };
  }
  revalidatePath("/settings/categories");
  revalidatePath("/inventory");
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  await prisma.category.delete({ where: { id } });
  revalidatePath("/settings/categories");
  return { ok: true };
}

// ---- Produce ----
const produceSchema = z.object({ name: z.string().min(1), barcode: z.string().optional() });

export async function addProduce(input: unknown): Promise<ActionResult> {
  const parsed = produceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid" };
  await prisma.produce.create({
    data: { name: parsed.data.name, barcode: parsed.data.barcode || null },
  });
  revalidatePath("/settings/produce");
  return { ok: true };
}

/**
 * Same as addProduce but returns the new row so callers (e.g. the harvest
 * dialog's inline "+ Add" affordance) can immediately select it. Skips the
 * barcode field; rare to know that during a harvest setup.
 */
export async function createProduceQuick(
  name: string,
): Promise<ActionResult<{ id: string; name: string }>> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required" };
  try {
    const p = await prisma.produce.create({
      data: { name: trimmed },
    });
    revalidatePath("/settings/produce");
    revalidatePath("/harvest");
    return { ok: true, data: { id: p.id, name: p.name } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create" };
  }
}

export async function updateProduce(id: string, input: unknown): Promise<ActionResult> {
  const parsed = produceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid" };
  await prisma.produce.update({
    where: { id },
    data: { name: parsed.data.name, barcode: parsed.data.barcode || null },
  });
  revalidatePath("/settings/produce");
  return { ok: true };
}

export async function deleteProduce(id: string): Promise<ActionResult> {
  await prisma.produce.delete({ where: { id } });
  revalidatePath("/settings/produce");
  return { ok: true };
}

// ---- Greenhouses ----
const ghSchema = z.object({
  name: z.string().min(1),
  location: z.string().optional(),
  type: z.string().optional(),
  notes: z.string().optional(),
});

export async function addGreenhouse(input: unknown): Promise<ActionResult> {
  const parsed = ghSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid" };
  await prisma.greenhouse.create({
    data: {
      name: parsed.data.name,
      location: parsed.data.location || null,
      type: parsed.data.type || null,
      notes: parsed.data.notes || null,
    },
  });
  revalidatePath("/settings/greenhouses");
  return { ok: true };
}

export async function updateGreenhouse(id: string, input: unknown): Promise<ActionResult> {
  const parsed = ghSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid" };
  await prisma.greenhouse.update({
    where: { id },
    data: {
      name: parsed.data.name,
      location: parsed.data.location || null,
      type: parsed.data.type || null,
      notes: parsed.data.notes || null,
    },
  });
  revalidatePath("/settings/greenhouses");
  return { ok: true };
}

export async function deleteGreenhouse(id: string): Promise<ActionResult> {
  await prisma.greenhouse.delete({ where: { id } });
  revalidatePath("/settings/greenhouses");
  return { ok: true };
}

// ---- Labour tasks ----
const labourTaskSchema = z.object({ name: z.string().min(1) });

export async function addLabourTask(input: unknown): Promise<ActionResult> {
  const parsed = labourTaskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid name" };
  try {
    // Push new tasks to the end of the list by default; admins can re-order
    // via Edit if needed later.
    const max = await prisma.labourTask.aggregate({
      _max: { sortOrder: true },
    });
    await prisma.labourTask.create({
      data: {
        name: parsed.data.name.trim(),
        sortOrder: (max._max.sortOrder ?? 0) + 10,
        active: true,
      },
    });
  } catch {
    return { ok: false, error: "A task with that name already exists" };
  }
  revalidatePath("/settings/labour-tasks");
  return { ok: true };
}

export async function updateLabourTask(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = labourTaskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid name" };
  try {
    await prisma.labourTask.update({
      where: { id },
      data: { name: parsed.data.name.trim() },
    });
  } catch {
    return { ok: false, error: "A task with that name already exists" };
  }
  revalidatePath("/settings/labour-tasks");
  return { ok: true };
}

export async function setLabourTaskActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  await prisma.labourTask.update({ where: { id }, data: { active } });
  revalidatePath("/settings/labour-tasks");
  return { ok: true };
}

export async function deleteLabourTask(id: string): Promise<ActionResult> {
  await prisma.labourTask.delete({ where: { id } });
  revalidatePath("/settings/labour-tasks");
  return { ok: true };
}

/**
 * Inline-create from the Log Labour dialog: returns the new row so the
 * dialog can select it without a refresh.
 */
export async function createLabourTaskQuick(
  name: string,
): Promise<ActionResult<{ id: string; name: string }>> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required" };
  try {
    const max = await prisma.labourTask.aggregate({
      _max: { sortOrder: true },
    });
    const t = await prisma.labourTask.create({
      data: {
        name: trimmed,
        sortOrder: (max._max.sortOrder ?? 0) + 10,
        active: true,
      },
    });
    revalidatePath("/settings/labour-tasks");
    return { ok: true, data: { id: t.id, name: t.name } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to create",
    };
  }
}

/**
 * Inline-create category from the Item dialog. Mirrors createProduceQuick.
 */
export async function createCategoryQuick(
  name: string,
): Promise<ActionResult<{ id: string; name: string }>> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required" };
  try {
    const c = await prisma.category.create({ data: { name: trimmed } });
    revalidatePath("/settings/categories");
    revalidatePath("/inventory");
    return { ok: true, data: { id: c.id, name: c.name } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to create",
    };
  }
}

// ---- General settings ----
const generalSchema = z.object({
  farmName: z.string().min(1),
  exchangeRate: z.string().regex(/^[0-9.]+$/),
});

export async function updateGeneralSettings(input: unknown): Promise<ActionResult> {
  const parsed = generalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid" };
  const rate = new Decimal(parsed.data.exchangeRate);
  await prisma.$transaction(async (tx: TransactionClient) => {
    await tx.setting.update({
      where: { id: "singleton" },
      data: { farmName: parsed.data.farmName, exchangeRate: rate },
    });
    await tx.exchangeRateHistory.create({
      data: { rate, effectiveFrom: new Date() },
    });
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
