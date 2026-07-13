"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { requireSuperuser } from "@/server/authz";
import { recordAction } from "@/server/audit";
import type { TransactionClient } from "@/server/decimal";
import { applyItemDepreciationPolicy } from "@/server/depreciation";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const schema = z
  .object({
    itemId: z.string().min(1),
    mode: z.enum(["NONE", "PER_USE", "CALENDAR"]),
    /** PER_USE: number of uses/harvests it lasts (twine = 4). */
    uses: z.coerce.number().int().min(1).max(10000).optional(),
    /** CALENDAR: useful life in months (a 2-year tool = 24). */
    months: z.coerce.number().int().min(1).max(1200).optional(),
  })
  .refine((v) => v.mode !== "PER_USE" || (v.uses ?? 0) >= 1, {
    message: "Enter how many uses it lasts",
    path: ["uses"],
  })
  .refine((v) => v.mode !== "CALENDAR" || (v.months ?? 0) >= 1, {
    message: "Enter the life in months",
    path: ["months"],
  });

/**
 * Set (or clear) an item's depreciation policy. Re-spreads every existing
 * harvest charge for the item from its full cost, so the P&L corrects itself.
 * Superuser only.
 */
export async function setItemDepreciation(input: unknown): Promise<ActionResult<{ installsUpdated: number }>> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const { itemId, mode, uses, months } = parsed.data;

  const item = await prisma.item.findFirst({ where: { id: itemId }, select: { id: true, name: true } });
  if (!item) return { ok: false, error: "Item not found" };

  try {
    const { installsUpdated } = await prisma.$transaction(async (tx: TransactionClient) => {
      const res = await applyItemDepreciationPolicy(tx, itemId, mode, { uses, months });
      await recordAction(tx, {
        type: "item.depreciation",
        entityType: "Item",
        entityId: itemId,
        description:
          mode === "PER_USE"
            ? `Set "${item.name}" to depreciate over ${uses} uses`
            : mode === "CALENDAR"
              ? `Set "${item.name}" to depreciate over ${months} months`
              : `Cleared depreciation on "${item.name}"`,
        userId: gate.userId,
        payload: { mode, uses: uses ?? null, months: months ?? null, installsUpdated: res.installsUpdated },
      });
      return res;
    });

    revalidatePath("/inventory");
    revalidatePath(`/inventory/${itemId}`);
    revalidatePath("/harvest");
    revalidatePath("/financials");
    return { ok: true, data: { installsUpdated } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't update depreciation" };
  }
}
