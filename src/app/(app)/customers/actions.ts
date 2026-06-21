"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import type { TransactionClient } from "@/server/decimal";
import { recordAction } from "@/server/audit";
import { auth } from "@/auth";

const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["RETAILER", "WHOLESALER", "CONSUMER"]).default("CONSUMER"),
  phone: z.string().optional().default(""),
  email: z.string().email().optional().or(z.literal("")).default(""),
  notes: z.string().optional().default(""),
});

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

function clean(input: z.infer<typeof customerSchema>) {
  return {
    name: input.name.trim(),
    type: input.type,
    phone: input.phone || null,
    email: input.email || null,
    notes: input.notes || null,
  };
}

export async function createCustomer(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const userId = await currentUserId();
  const customer = await prisma.$transaction(async (tx: TransactionClient) => {
    const c = await tx.customer.create({ data: clean(parsed.data) });
    await recordAction(tx, {
      type: "customer.create",
      entityType: "Customer",
      entityId: c.id,
      description: `Added customer: ${c.name} (${parsed.data.type.toLowerCase()})`,
      userId,
      payload: { name: c.name, type: parsed.data.type },
    });
    return c;
  });
  revalidatePath("/customers");
  revalidatePath("/sales");
  return { ok: true, data: { id: customer.id } };
}

export async function updateCustomer(id: string, input: unknown): Promise<ActionResult> {
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const userId = await currentUserId();
  await prisma.$transaction(async (tx: TransactionClient) => {
    const before = await tx.customer.findUnique({ where: { id } });
    if (!before) throw new Error("Customer not found");
    await tx.customer.update({ where: { id }, data: clean(parsed.data) });
    await recordAction(tx, {
      type: "customer.update",
      entityType: "Customer",
      entityId: id,
      description: `Updated customer: ${parsed.data.name} (${parsed.data.type.toLowerCase()})`,
      userId,
      payload: { before, after: clean(parsed.data) },
    });
  });
  revalidatePath("/customers");
  revalidatePath("/sales");
  return { ok: true };
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  const userId = await currentUserId();
  await prisma.$transaction(async (tx: TransactionClient) => {
    const customer = await tx.customer.findUnique({ where: { id } });
    if (!customer) throw new Error("Customer not found");
    // Sales keep their history; the FK is SET NULL on delete, so a removed
    // customer just leaves those sales unattributed.
    await tx.customer.delete({ where: { id } });
    await recordAction(tx, {
      type: "customer.delete",
      entityType: "Customer",
      entityId: id,
      description: `Deleted customer: ${customer.name}`,
      userId,
      payload: customer,
    });
  });
  revalidatePath("/customers");
  revalidatePath("/sales");
  return { ok: true };
}
