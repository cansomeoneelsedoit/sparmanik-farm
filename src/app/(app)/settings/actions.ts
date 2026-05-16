"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";

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

export async function deleteGreenhouse(id: string): Promise<ActionResult> {
  await prisma.greenhouse.delete({ where: { id } });
  revalidatePath("/settings/greenhouses");
  return { ok: true };
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
  await prisma.$transaction(async (tx: typeof prisma) => {
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
