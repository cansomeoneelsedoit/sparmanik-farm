"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { recordAction } from "@/server/audit";
import { Decimal, type TransactionClient } from "@/server/decimal";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

async function uid() {
  return (await auth())?.user?.id ?? null;
}

const staffSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional().default(""),
  avatar: z.string().optional().default(""),
  rate: z.string().regex(/^[0-9.]+$/),
  effectiveFrom: z.string().min(1),
});

export async function createStaff(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  const initials = parsed.data.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const staff = await prisma.$transaction(async (tx: TransactionClient) => {
    const s = await tx.staff.create({
      data: {
        name: parsed.data.name,
        role: parsed.data.role || null,
        avatar: parsed.data.avatar || initials,
        rates: {
          create: { rate: new Decimal(parsed.data.rate), effectiveFrom: new Date(parsed.data.effectiveFrom) },
        },
      },
    });
    await recordAction(tx, {
      type: "staff.create",
      entityType: "Staff",
      entityId: s.id,
      description: `Added staff: ${s.name}`,
      userId,
      payload: { name: s.name },
    });
    return s;
  });
  revalidatePath("/staff");
  return { ok: true, data: { id: staff.id } };
}

const updateStaffSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional().default(""),
  avatar: z.string().optional().default(""),
});

export async function updateStaff(id: string, input: unknown): Promise<ActionResult> {
  const parsed = updateStaffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  await prisma.staff.update({
    where: { id },
    data: {
      name: parsed.data.name,
      role: parsed.data.role || null,
      avatar: parsed.data.avatar || null,
    },
  });
  revalidatePath("/staff");
  return { ok: true };
}

export async function deleteStaff(id: string): Promise<ActionResult> {
  try {
    await prisma.staff.delete({ where: { id } });
  } catch {
    return { ok: false, error: "Can't delete staff who have wage entries — delete those first" };
  }
  revalidatePath("/staff");
  return { ok: true };
}

const updateRateSchema = z.object({
  rate: z.string().regex(/^[0-9.]+$/),
  effectiveFrom: z.string().min(1),
});

export async function updateStaffRate(id: string, input: unknown): Promise<ActionResult> {
  const parsed = updateRateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  await prisma.staffRate.update({
    where: { id },
    data: { rate: new Decimal(parsed.data.rate), effectiveFrom: new Date(parsed.data.effectiveFrom) },
  });
  revalidatePath("/staff");
  return { ok: true };
}

export async function deleteStaffRate(id: string): Promise<ActionResult> {
  await prisma.staffRate.delete({ where: { id } });
  revalidatePath("/staff");
  return { ok: true };
}

export async function deleteWageEntry(id: string): Promise<ActionResult> {
  await prisma.wageEntry.delete({ where: { id } });
  revalidatePath("/staff");
  return { ok: true };
}

const rateSchema = z.object({
  staffId: z.string(),
  rate: z.string().regex(/^[0-9.]+$/),
  effectiveFrom: z.string().min(1),
});

export async function addStaffRate(input: unknown): Promise<ActionResult> {
  const parsed = rateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  await prisma.$transaction(async (tx: TransactionClient) => {
    const r = await tx.staffRate.create({
      data: {
        staffId: parsed.data.staffId,
        rate: new Decimal(parsed.data.rate),
        effectiveFrom: new Date(parsed.data.effectiveFrom),
      },
    });
    await recordAction(tx, {
      type: "staff.pay_rise",
      entityType: "StaffRate",
      entityId: r.id,
      description: `Pay rise`,
      userId,
      payload: { staffId: parsed.data.staffId, rateId: r.id },
    });
  });
  revalidatePath("/staff");
  return { ok: true };
}

const wageSchema = z.object({
  staffId: z.string(),
  date: z.string().min(1),
  lines: z.array(
    z.object({
      hours: z.string().regex(/^[0-9.]+$/),
      task: z.string().optional().default(""),
      harvestId: z.string().optional().nullable(),
      greenhouseId: z.string().optional().nullable(),
    }),
  ).min(1),
});

export async function createWageEntry(input: unknown): Promise<ActionResult> {
  const parsed = wageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  const totalHours = parsed.data.lines.reduce((s, l) => s + Number(l.hours), 0);
  await prisma.$transaction(async (tx: TransactionClient) => {
    const e = await tx.wageEntry.create({
      data: {
        staffId: parsed.data.staffId,
        date: new Date(parsed.data.date),
        totalHours: new Decimal(totalHours.toFixed(2)),
        lines: {
          create: parsed.data.lines.map((l) => ({
            hours: new Decimal(l.hours),
            task: l.task || null,
            harvestId: l.harvestId || null,
            greenhouseId: l.greenhouseId || null,
          })),
        },
      },
    });
    await recordAction(tx, {
      type: "wage.create",
      entityType: "WageEntry",
      entityId: e.id,
      description: `Wage entry`,
      userId,
      payload: { staffId: parsed.data.staffId },
    });
  });
  revalidatePath("/staff");
  return { ok: true };
}
