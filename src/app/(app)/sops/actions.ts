"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const sopSchema = z.object({
  titleEn: z.string().min(1),
  titleId: z.string().min(1),
  descriptionEn: z.string().optional().default(""),
  descriptionId: z.string().optional().default(""),
  category: z.string().optional().default(""),
  steps: z.array(z.object({ bodyEn: z.string().min(1), bodyId: z.string().min(1) })).default([]),
});

export async function createSop(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = sopSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const sop = await prisma.sop.create({
    data: {
      titleEn: parsed.data.titleEn,
      titleId: parsed.data.titleId,
      descriptionEn: parsed.data.descriptionEn || null,
      descriptionId: parsed.data.descriptionId || null,
      category: parsed.data.category || null,
      steps: { create: parsed.data.steps.map((s, i) => ({ position: i, bodyEn: s.bodyEn, bodyId: s.bodyId })) },
    },
  });
  revalidatePath("/sops");
  return { ok: true, data: { id: sop.id } };
}

export async function updateSop(id: string, input: unknown): Promise<ActionResult> {
  const parsed = sopSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  await prisma.$transaction(async (tx: typeof prisma) => {
    await tx.sopStep.deleteMany({ where: { sopId: id } });
    await tx.sop.update({
      where: { id },
      data: {
        titleEn: parsed.data.titleEn,
        titleId: parsed.data.titleId,
        descriptionEn: parsed.data.descriptionEn || null,
        descriptionId: parsed.data.descriptionId || null,
        category: parsed.data.category || null,
        steps: { create: parsed.data.steps.map((s, i) => ({ position: i, bodyEn: s.bodyEn, bodyId: s.bodyId })) },
      },
    });
  });
  revalidatePath("/sops");
  revalidatePath(`/sops/${id}`);
  return { ok: true };
}

export async function setSopStatus(id: string, status: "ACTIVE" | "ARCHIVED"): Promise<ActionResult> {
  await prisma.sop.update({ where: { id }, data: { status } });
  revalidatePath("/sops");
  revalidatePath(`/sops/${id}`);
  return { ok: true };
}

export async function deleteSop(id: string): Promise<ActionResult> {
  await prisma.sop.delete({ where: { id } });
  revalidatePath("/sops");
  return { ok: true };
}
