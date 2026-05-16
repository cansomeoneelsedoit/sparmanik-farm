"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { recordAction } from "@/server/audit";
import { Decimal } from "@/server/decimal";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

async function uid() {
  return (await auth())?.user?.id ?? null;
}

const recipeSchema = z.object({
  name: z.string().min(1),
  crop: z.string().optional().default(""),
  stage: z.string().optional().default(""),
  ec: z.string().optional().default(""),
  ph: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  ingredients: z.array(z.object({ name: z.string().min(1), amount: z.string().min(1) })).default([]),
});

export async function createRecipe(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = recipeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  const r = await prisma.$transaction(async (tx: typeof prisma) => {
    const recipe = await tx.nutrientRecipe.create({
      data: {
        name: parsed.data.name,
        crop: parsed.data.crop || null,
        stage: parsed.data.stage || null,
        ec: parsed.data.ec ? new Decimal(parsed.data.ec) : null,
        ph: parsed.data.ph || null,
        notes: parsed.data.notes || null,
        ingredients: { create: parsed.data.ingredients },
      },
    });
    await recordAction(tx, {
      type: "recipe.create",
      entityType: "NutrientRecipe",
      entityId: recipe.id,
      description: `Added recipe: ${recipe.name}`,
      userId,
      payload: {},
    });
    return recipe;
  });
  revalidatePath("/recipes");
  return { ok: true, data: { id: r.id } };
}

export async function updateRecipe(id: string, input: unknown): Promise<ActionResult> {
  const parsed = recipeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  await prisma.$transaction(async (tx: typeof prisma) => {
    await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
    await tx.nutrientRecipe.update({
      where: { id },
      data: {
        name: parsed.data.name,
        crop: parsed.data.crop || null,
        stage: parsed.data.stage || null,
        ec: parsed.data.ec ? new Decimal(parsed.data.ec) : null,
        ph: parsed.data.ph || null,
        notes: parsed.data.notes || null,
        ingredients: { create: parsed.data.ingredients },
      },
    });
  });
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);
  return { ok: true };
}

export async function deleteRecipe(id: string): Promise<ActionResult> {
  await prisma.nutrientRecipe.delete({ where: { id } });
  revalidatePath("/recipes");
  return { ok: true };
}
