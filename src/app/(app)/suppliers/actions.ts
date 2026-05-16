"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { recordAction } from "@/server/audit";
import { auth } from "@/auth";

const supplierSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional().default(""),
  email: z.string().email().optional().or(z.literal("")).default(""),
  notes: z.string().optional().default(""),
  shopUrl: z.string().url().optional().or(z.literal("")).default(""),
});

export type SupplierInput = z.infer<typeof supplierSchema>;

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function createSupplier(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const userId = await currentUserId();
  const supplier = await prisma.$transaction(async (tx: typeof prisma) => {
    const s = await tx.supplier.create({ data: parsed.data });
    await recordAction(tx, {
      type: "supplier.create",
      entityType: "Supplier",
      entityId: s.id,
      description: `Added supplier: ${s.name}`,
      userId,
      payload: { name: s.name },
    });
    return s;
  });
  revalidatePath("/suppliers");
  return { ok: true, data: { id: supplier.id } };
}

export async function updateSupplier(id: string, input: unknown): Promise<ActionResult> {
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const userId = await currentUserId();
  await prisma.$transaction(async (tx: typeof prisma) => {
    const before = await tx.supplier.findUnique({ where: { id } });
    if (!before) throw new Error("Supplier not found");
    await tx.supplier.update({ where: { id }, data: parsed.data });
    await recordAction(tx, {
      type: "supplier.update",
      entityType: "Supplier",
      entityId: id,
      description: `Updated supplier: ${parsed.data.name}`,
      userId,
      payload: { before, after: parsed.data },
    });
  });
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  return { ok: true };
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
  const userId = await currentUserId();
  await prisma.$transaction(async (tx: typeof prisma) => {
    const supplier = await tx.supplier.findUnique({ where: { id } });
    if (!supplier) throw new Error("Supplier not found");
    await tx.supplier.delete({ where: { id } });
    await recordAction(tx, {
      type: "supplier.delete",
      entityType: "Supplier",
      entityId: id,
      description: `Deleted supplier: ${supplier.name}`,
      userId,
      payload: supplier,
    });
  });
  revalidatePath("/suppliers");
  return { ok: true };
}
