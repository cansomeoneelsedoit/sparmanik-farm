"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { requireStaff } from "@/server/authz";
import { recordAction } from "@/server/audit";
import { Decimal, type TransactionClient } from "@/server/decimal";

/**
 * Set (or clear) how much of a produce is still UNSOLD on hand for a cycle.
 *
 * Boyd thinks in "leftover I haven't sold yet", but the DB stores the total
 * kg PICKED (`harvestedKg`). The two are self-consistent because
 *   harvestedKg = sold + given/waste + unsold
 * so re-opening the dialog shows unsold = harvestedKg − sold − disposed, and
 * re-saving the same unsold keeps harvestedKg stable. As leftovers sell, `sold`
 * grows and the derived unsold shrinks without touching harvestedKg — the cycle
 * stays closed for costs while only income moves.
 *
 * An empty/blank unsoldKg clears harvestedKg back to null (falls back to
 * sold+disposed as "produced").
 */
const schema = z.object({
  harvestId: z.string().min(1),
  produceId: z.string().min(1),
  // Boyd's "still unsold on hand" figure. Empty = clear the harvested total.
  unsoldKg: z
    .string()
    .refine((v) => v.trim() === "" || /^\d+(\.\d+)?$/.test(v.trim()), "Enter a weight in kg")
    .optional(),
  // Optional estimated sale price per kg for the leftover (drives the est.
  // value shown on the harvest). Empty = clear it.
  estPricePerKg: z
    .string()
    .refine((v) => v.trim() === "" || /^\d+(\.\d+)?$/.test(v.trim()), "Enter a price per kg")
    .optional(),
});

export async function setHarvestProduceHarvested(input: {
  harvestId: string;
  produceId: string;
  unsoldKg: string;
  estPricePerKg?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // Staff-only (PORTAL students must not write farm data) — server actions
  // are open POST endpoints, so the gate lives here, not just in the proxy.
  const gate = await requireStaff();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const { harvestId, produceId } = parsed.data;
  const userId = gate.userId;
  const raw = (parsed.data.unsoldKg ?? "").trim();

  // HarvestProduce itself isn't org-scoped (it's a join row) — anchor tenancy
  // on the parent harvest via the org-scoping extension. A cross-org harvest
  // id comes back null and the action stops here.
  const owned = await prisma.harvest.findFirst({
    where: { id: harvestId },
    select: { id: true },
  });
  if (!owned) return { ok: false, error: "Cycle not found" };

  try {
    // Derive harvestedKg from what's already recorded so it stays self-consistent.
    const [soldAgg, dispAgg] = await Promise.all([
      prisma.sale.aggregate({ where: { harvestId, produceId }, _sum: { weight: true } }),
      prisma.harvestDisposition.aggregate({
        where: { harvestId, produceId },
        _sum: { weight: true },
      }),
    ]);
    const sold = new Decimal(soldAgg._sum.weight ?? 0);
    const disposed = new Decimal(dispAgg._sum.weight ?? 0);

    const harvestedKg =
      raw === "" ? null : sold.plus(disposed).plus(new Decimal(raw)).toDecimalPlaces(4);

    // Estimated price/kg for the leftover — only meaningful when there's a
    // harvested total; clearing the total clears the estimate too.
    const estRaw = (parsed.data.estPricePerKg ?? "").trim();
    const unsoldEstPricePerKg =
      harvestedKg === null || estRaw === "" ? null : new Decimal(estRaw).toDecimalPlaces(4);

    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.harvestProduce.update({
        where: { harvestId_produceId: { harvestId, produceId } },
        data: { harvestedKg, unsoldEstPricePerKg },
      });
      await recordAction(tx, {
        type: "harvest.set_harvested",
        entityType: "HarvestProduce",
        entityId: `${harvestId}:${produceId}`,
        description:
          harvestedKg === null
            ? "Cleared harvested/unsold total"
            : `Set unsold on hand to ${raw} kg (produced ${harvestedKg.toString()} kg)`,
        userId,
        payload: {
          harvestId,
          produceId,
          unsoldKg: raw === "" ? null : raw,
          sold: sold.toString(),
          disposed: disposed.toString(),
          harvestedKg: harvestedKg === null ? null : harvestedKg.toString(),
        },
      });
    });
  } catch (e) {
    // P2025 = the join row doesn't exist (produce isn't attached to this cycle).
    if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2025") {
      return {
        ok: false,
        error: "That produce isn't attached to this cycle. Add it to the harvest first.",
      };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save the harvested total" };
  }

  revalidatePath(`/harvest/${harvestId}`);
  revalidatePath("/financials");
  return { ok: true };
}
