"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { requireSuperuser } from "@/server/authz";
import { recordAction } from "@/server/audit";
import { consumeFifo } from "@/server/fifo";
import {
  amortisedCharge as computeAmortised,
  cycleMonths,
  installDepreciation,
  type InstallChargeRow,
} from "@/server/depreciation";
import { Decimal, type TransactionClient } from "@/server/decimal";
import { adjustHarvestedTotal, createSaleTx, hasOverride } from "@/server/sales";
import { todayWIB } from "@/lib/date";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function uid() {
  return (await auth())?.user?.id ?? null;
}

/**
 * Plain-JSON snapshot for audit payloads. Prisma Decimal + Date both implement
 * toJSON (→ string / ISO), so round-tripping through JSON gives a payload the
 * undo handlers can rehydrate (app review #29).
 */
function snapshot<T>(row: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(row));
}

const startSchema = z.object({
  greenhouseId: z.string().min(1),
  // Legacy single-produce field — kept as the "primary" for backward compat.
  produceId: z.string().optional().nullable(),
  // New multi-produce field. If provided, replaces the join table content.
  // When both are present, produceIds wins; produceId is overwritten to the
  // first element so old reports still work.
  produceIds: z.array(z.string()).optional(),
  name: z.string().min(1),
  variety: z.string().optional().default(""),
  startDate: z.string().min(1),
});

export async function startHarvest(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  const ids = parsed.data.produceIds ?? (parsed.data.produceId ? [parsed.data.produceId] : []);
  const primary = ids[0] ?? null;
  const h = await prisma.$transaction(async (tx: TransactionClient) => {
    const created = await tx.harvest.create({
      data: {
        greenhouseId: parsed.data.greenhouseId,
        produceId: primary,
        name: parsed.data.name,
        variety: parsed.data.variety || null,
        startDate: new Date(parsed.data.startDate),
        status: "LIVE",
      },
    });
    if (ids.length > 0) {
      await tx.harvestProduce.createMany({
        data: ids.map((produceId) => ({ harvestId: created.id, produceId })),
        skipDuplicates: true,
      });
    }
    await recordAction(tx, {
      type: "harvest.start",
      entityType: "Harvest",
      entityId: created.id,
      description: `Started harvest: ${created.name}`,
      userId,
      payload: { produceIds: ids },
    });
    return created;
  });
  revalidatePath("/harvest");
  return { ok: true, data: { id: h.id } };
}

const updateHarvestSchema = z.object({
  name: z.string().min(1),
  variety: z.string().optional().default(""),
  greenhouseId: z.string().min(1),
  produceId: z.string().optional().nullable(),
  produceIds: z.array(z.string()).optional(),
  startDate: z.string().min(1),
  endDate: z.string().optional().nullable(),
  status: z.enum(["LIVE", "CLOSED"]).default("LIVE"),
});

export async function updateHarvest(id: string, input: unknown): Promise<ActionResult> {
  const parsed = updateHarvestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const ids = parsed.data.produceIds ?? (parsed.data.produceId ? [parsed.data.produceId] : []);
  const primary = ids[0] ?? null;
  await prisma.$transaction(async (tx: TransactionClient) => {
    await tx.harvest.update({
      where: { id },
      data: {
        name: parsed.data.name,
        variety: parsed.data.variety || null,
        greenhouseId: parsed.data.greenhouseId,
        produceId: primary,
        startDate: new Date(parsed.data.startDate),
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
        status: parsed.data.status,
      },
    });
    // Replace the join table contents wholesale.
    if (parsed.data.produceIds !== undefined) {
      await tx.harvestProduce.deleteMany({ where: { harvestId: id } });
      if (ids.length > 0) {
        await tx.harvestProduce.createMany({
          data: ids.map((produceId) => ({ harvestId: id, produceId })),
          skipDuplicates: true,
        });
      }
    }
  });
  revalidatePath("/harvest");
  revalidatePath(`/harvest/${id}`);
  return { ok: true };
}

export async function deleteHarvest(id: string): Promise<ActionResult> {
  const userId = await uid();
  try {
    // Refuse to delete a cycle that carries money/yield history — a mistaken
    // tap would cascade away every sale/usage/disposition under it. Steer the
    // user to Close it instead (app review #7, #9).
    const [sales, usages, assets, dispositions] = await Promise.all([
      prisma.sale.count({ where: { harvestId: id } }),
      prisma.harvestUsage.count({ where: { harvestId: id } }),
      prisma.harvestAsset.count({ where: { harvestId: id } }),
      prisma.harvestDisposition.count({ where: { harvestId: id } }),
    ]);
    if (sales + usages + assets + dispositions > 0) {
      return {
        ok: false,
        error: `This greenhouse cycle has ${sales} sale(s), ${usages} usage entr(ies), ${assets} asset(s) and ${dispositions} disposition(s). Deleting would erase that history. Close the cycle instead (Edit → status Closed).`,
      };
    }
    const harvest = await prisma.harvest.findUnique({ where: { id } });
    if (!harvest) return { ok: false, error: "Not found" };
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.harvest.delete({ where: { id } });
      await recordAction(tx, {
        type: "harvest.delete",
        entityType: "Harvest",
        entityId: id,
        description: `Deleted empty greenhouse cycle: ${harvest.name}`,
        userId,
        payload: snapshot(harvest),
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't delete this cycle" };
  }
  revalidatePath("/harvest");
  return { ok: true };
}

export async function deleteSale(id: string): Promise<ActionResult> {
  const userId = await uid();
  try {
    const sale = await prisma.sale.findUnique({ where: { id } });
    if (!sale) return { ok: false, error: "Sale not found" };
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.sale.delete({ where: { id } });
      // Reverse the pool bookkeeping: a freshly-picked sale grew the harvested
      // total when logged, so deleting it shrinks the total back. A from-unsold
      // sale needs no delta — the pool restores by itself once sold drops.
      if (sale.harvestId && sale.produceId) {
        await adjustHarvestedTotal(
          tx,
          sale.harvestId,
          sale.produceId,
          sale.fromUnsold === false ? new Decimal(sale.weight).negated() : new Decimal(0),
        );
      }
      await recordAction(tx, {
        type: "harvest.delete_sale",
        entityType: "Sale",
        entityId: id,
        description: `Deleted a sale`,
        userId,
        payload: snapshot(sale),
      });
    });
    if (sale.harvestId) revalidatePath(`/harvest/${sale.harvestId}`);
    revalidatePath("/sales");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't delete this sale" };
  }
  return { ok: true };
}

const updateSaleSchema = z.object({
  produceId: z.string(),
  date: z.string(),
  grade: z.enum(["A", "B", "C", "D"]),
  weight: z.string(),
  pricePerKg: z.string(),
  customerId: z.string().optional(),
  /** Optional override of the charged total (a discount/markup). When set it
   *  becomes the recorded amount; weight + price/kg stay as the "list" figures
   *  so yield and reporting stay accurate. */
  amountOverride: z.string().optional(),
});


export async function updateSale(id: string, input: unknown): Promise<ActionResult> {
  const parsed = updateSaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  const weight = new Decimal(parsed.data.weight);
  const price = new Decimal(parsed.data.pricePerKg);
  const amount = hasOverride(parsed.data.amountOverride)
    ? new Decimal(parsed.data.amountOverride)
    : weight.times(price);
  try {
    const before = await prisma.sale.findUnique({ where: { id } });
    if (!before) return { ok: false, error: "Sale not found" };
    const produceChanged = before.produceId !== parsed.data.produceId;
    const sale = await prisma.$transaction(async (tx: TransactionClient) => {
      const updated = await tx.sale.update({
        where: { id },
        data: {
          produceId: parsed.data.produceId,
          date: new Date(parsed.data.date),
          grade: parsed.data.grade,
          weight,
          pricePerKg: price,
          amount,
          customerId: parsed.data.customerId || null,
          // Moving the sale to another produce breaks the origin link — the
          // new produce's pool never saw this sale, so it becomes untracked.
          ...(produceChanged ? { fromUnsold: null } : {}),
        },
      });
      // Keep the pool bookkeeping in step with the edit. A freshly-picked
      // sale's weight change shifts the harvested total by the difference; a
      // produce change takes the whole weight off the old produce's total.
      if (before.harvestId) {
        if (produceChanged) {
          if (before.produceId) {
            await adjustHarvestedTotal(
              tx,
              before.harvestId,
              before.produceId,
              before.fromUnsold === false ? new Decimal(before.weight).negated() : new Decimal(0),
            );
          }
          // Clamp the receiving produce's pool in case the moved weight
          // overshoots what it had recorded as unsold.
          await adjustHarvestedTotal(tx, before.harvestId, parsed.data.produceId, new Decimal(0));
        } else if (before.fromUnsold !== null) {
          await adjustHarvestedTotal(
            tx,
            before.harvestId,
            parsed.data.produceId,
            before.fromUnsold === false
              ? weight.minus(new Decimal(before.weight))
              : new Decimal(0),
          );
        }
      }
      await recordAction(tx, {
        type: "harvest.update_sale",
        entityType: "Sale",
        entityId: id,
        description: `Edited a sale`,
        userId,
        payload: { before: snapshot(before) },
      });
      return updated;
    });
    revalidatePath(`/harvest/${sale.harvestId}`);
    revalidatePath("/sales");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save this sale" };
  }
  return { ok: true };
}

export async function deleteHarvestUsage(id: string): Promise<ActionResult> {
  const userId = await uid();
  try {
    const usage = await prisma.harvestUsage.findUnique({ where: { id } });
    if (!usage) return { ok: false, error: "Not found" };
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.harvestUsage.delete({ where: { id } });
      await recordAction(tx, {
        type: "harvest.delete_usage",
        entityType: "HarvestUsage",
        entityId: id,
        description: `Deleted a usage entry`,
        userId,
        payload: snapshot(usage),
      });
    });
    if (usage.harvestId) revalidatePath(`/harvest/${usage.harvestId}`);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't delete this usage" };
  }
  return { ok: true };
}

export async function deleteHarvestAsset(id: string): Promise<ActionResult> {
  const userId = await uid();
  try {
    const asset = await prisma.harvestAsset.findUnique({ where: { id } });
    if (!asset) return { ok: false, error: "Not found" };
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.harvestAsset.delete({ where: { id } });
      await recordAction(tx, {
        type: "harvest.delete_asset",
        entityType: "HarvestAsset",
        entityId: id,
        description: `Deleted an installed asset`,
        userId,
        payload: snapshot(asset),
      });
    });
    if (asset.harvestId) revalidatePath(`/harvest/${asset.harvestId}`);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't delete this asset" };
  }
  return { ok: true };
}

/**
 * Delete a single labour line (one WageEntryLine) without touching the
 * other lines on the same WageEntry. The wage entry itself stays — it's
 * possible to have a day with hours allocated to other harvests or to
 * general farm work, and removing one allocation shouldn't blow away
 * the staff member's whole day.
 */
export async function deleteLabourLine(id: string): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  try {
    const line = await prisma.wageEntryLine.findUnique({
      where: { id },
      include: { wageEntry: { select: { staffId: true } } },
    });
    if (!line) return { ok: false, error: "Labour line not found" };
    // WageEntryLine has no organizationId — verify via the (org-scoped) Staff.
    const staff = await prisma.staff.findFirst({
      where: { id: line.wageEntry.staffId },
      select: { id: true },
    });
    if (!staff) return { ok: false, error: "Not found" };
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.wageEntryLine.delete({ where: { id } });
      await recordAction(tx, {
        type: "harvest.delete_labour_line",
        entityType: "WageEntryLine",
        entityId: id,
        description: `Deleted a labour line`,
        userId: gate.userId,
        payload: snapshot(line),
      });
    });
    if (line.harvestId) revalidatePath(`/harvest/${line.harvestId}`);
    // Wages also feed Financials and the staff page.
    revalidatePath("/financials");
    revalidatePath("/staff");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't delete this labour line" };
  }
  return { ok: true };
}

// Shared types used by endHarvest + checkInHarvestAsset.
type ConsumptionWithBatch = {
  id: string;
  qty: Decimal;
  batch: {
    id: string;
    itemId: string;
    supplierId: string | null;
    price: Decimal;
    exchangeRate: Decimal;
    maxUses: number;
    useCount: number;
    amortisedCostPerUse: Decimal | null;
    usefulLifeMonths: number | null;
  };
};
type AssetRowForReturn = {
  id: string;
  depreciable: boolean;
  depreciationMode: string | null;
  amortisedCharge: Decimal | null;
  acquisitionCost: Decimal | null;
  usefulLifeMonths: number | null;
  date: Date;
  returnedAt: Date | null;
  consumptions: ConsumptionWithBatch[];
};

/**
 * For each consumption slice of an asset, either return it to inventory as a
 * `returned=true, price=0` batch (preserving the amortisation schedule) or
 * mark it as discarded if all uses are spent. Shared by `checkInHarvestAsset`
 * (condition=good) and the legacy end-harvest auto-good path.
 */
async function returnAssetSlicesToInventory(
  tx: TransactionClient,
  asset: AssetRowForReturn,
  whenDate: Date,
  summary: { returned: number; discarded: number },
) {
  let anyDiscarded = false;
  let allDiscarded = asset.consumptions.length > 0;
  for (const c of asset.consumptions) {
    const b = c.batch;
    if (b.useCount < b.maxUses) {
      // CALENDAR equipment carries its schedule on the batch: keep the ORIGINAL
      // unit price (the cost basis the next cycle's straight-line charge needs)
      // and the useful life. PER_USE keeps price=0 by design — its remaining
      // value rides in amortisedCostPerUse instead. Without these carriers a
      // returned calendar asset re-installs at cost 0 and its remaining book
      // value vanishes from every report.
      const isCalendar = b.usefulLifeMonths != null && b.usefulLifeMonths > 0;
      await tx.batch.create({
        data: {
          itemId: b.itemId,
          supplierId: b.supplierId,
          date: whenDate,
          price: isCalendar ? new Decimal(b.price) : new Decimal(0),
          qty: new Decimal(c.qty),
          exchangeRate: b.exchangeRate,
          maxUses: b.maxUses,
          useCount: b.useCount,
          amortisedCostPerUse: b.amortisedCostPerUse,
          usefulLifeMonths: b.usefulLifeMonths,
          returned: true,
        },
      });
      summary.returned += Number(c.qty);
      allDiscarded = false;
    } else {
      anyDiscarded = true;
      summary.discarded += Number(c.qty);
    }
  }
  if (allDiscarded || anyDiscarded) {
    await tx.harvestAsset.update({
      where: { id: asset.id },
      data: { discarded: allDiscarded },
    });
  }
}

const checkInSchema = z.object({
  harvestAssetId: z.string().min(1),
  /** "used" = consumed in place (foam glued to the tank, weedmat pinned down):
   *  the whole taken-out amount stays in the greenhouse — charged once, nothing
   *  returns to stock, nothing is written off as damaged/lost. */
  condition: z.enum(["good", "damaged", "lost", "used"]),
  /** Quantity actually USED, in PACK units (the dialog converts from the
   *  item's real unit — metres/pcs/grams/kg). When present, the lightweight
   *  path runs: charge only the used amount to the harvest, no stock return. */
  usedQty: z.string().optional(),
  /** Human "30 metres" string for the audit log / note. */
  usedDisplay: z.string().optional().default(""),
  date: z.string().min(1),
  note: z.string().optional().default(""),
});

/**
 * Mid-harvest return of a taken-out asset.
 *   - good     → return slices to inventory (same code path as end-harvest)
 *   - damaged  → don't return; mark source batches' damagedFromHarvestId so
 *                Financials can attribute the write-off; residual depreciable
 *                value stays on the business books (no recovery)
 *   - lost     → same as damaged
 *   - used     → consumed in place (foam glued to the tank): the FULL taken-out
 *                amount is charged once, nothing returns to stock, and nothing
 *                is written off — it simply lives in the greenhouse now.
 * In all cases `returnCondition` / `returnedAt` / `returnNote` are stamped on
 * the HarvestAsset so endHarvest can skip it.
 */
export async function checkInHarvestAsset(input: unknown): Promise<ActionResult> {
  const parsed = checkInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  const when = new Date(parsed.data.date);
  const summary = { returned: 0, discarded: 0 };

  try {
    const harvestId = await prisma.$transaction(async (tx: TransactionClient) => {
      const asset = (await tx.harvestAsset.findUnique({
        where: { id: parsed.data.harvestAssetId },
        include: {
          consumptions: {
            include: {
              batch: {
                select: {
                  id: true,
                  itemId: true,
                  supplierId: true,
                  price: true,
                  exchangeRate: true,
                  maxUses: true,
                  useCount: true,
                  amortisedCostPerUse: true,
                  usefulLifeMonths: true,
                },
              },
            },
          },
        },
      })) as
        | (AssetRowForReturn & {
            harvestId: string;
            returnCondition: string | null;
            qty: Decimal;
            date: Date;
            depreciable: boolean;
            depreciationMode: string | null;
            amortisedCharge: Decimal | null;
            acquisitionCost: Decimal | null;
            usefulLifeMonths: number | null;
          })
        | null;
      if (!asset) throw new Error("Asset not found");
      if (asset.returnCondition) {
        throw new Error(`Asset already checked in (${asset.returnCondition})`);
      }

      // --- Used-quantity path -------------------------------------------
      // Staff entered how much was actually USED. RETURN the unused remainder to
      // stock (app review #11) by trimming the install's BatchConsumption rows
      // to the used quantity — deleting/reducing a consumption row puts that qty
      // back on the shelf (stock = qty − Σconsumed).
      //
      // How the harvest is charged depends on the asset kind, matching the
      // Financials treatment:
      //  • DEPRECIABLE (rockwool, cocopeat): cost is the per-use amortised
      //    charge, scaled to the used amount here. (Its install consumptions are
      //    excluded from COGS by design — review #10 — so trimming them only
      //    moves stock, it does NOT double-reduce the charge.)
      //  • NON-DEPRECIABLE reusable asset: install consumptions hang off the
      //    HarvestAsset, and getHarvestPL.usageCost only reads HarvestUsage
      //    consumptions — so these never enter the harvest P&L either way. The
      //    trim here purely returns the unused stock; the harvest is charged
      //    nothing (the full price stays on Total Business Financials).
      if (parsed.data.usedQty !== undefined || parsed.data.condition === "used") {
        const installedPacks = new Decimal(asset.qty);
        // Clamp: staff may type "more than installed" (the dialog allows it with
        // a warning). Never delete more than was consumed or over-scale the
        // amortised charge. "Used up / lives in the greenhouse" always consumes
        // the FULL taken-out amount — nothing returns to stock.
        const usedPacks =
          parsed.data.condition === "used"
            ? installedPacks
            : Decimal.min(new Decimal(parsed.data.usedQty as string), installedPacks);
        const remainder = installedPacks.minus(usedPacks);

        if (remainder.gt(new Decimal("0.00005"))) {
          // Deterministic order (by id) so which batch keeps the return is
          // stable across runs.
          const slices = [...asset.consumptions].sort((a, b) => a.id.localeCompare(b.id));
          let keep = usedPacks;
          for (const c of slices) {
            const cQty = new Decimal(c.qty);
            if (keep.lte(0)) {
              // Whole slice is unused — return it to stock.
              await tx.batchConsumption.delete({ where: { id: c.id } });
            } else if (keep.gte(cQty)) {
              keep = keep.minus(cQty);
            } else {
              // Boundary slice: keep the used part, return the rest.
              await tx.batchConsumption.update({ where: { id: c.id }, data: { qty: keep } });
              keep = new Decimal(0);
            }
          }
        }

        const usedFraction = installedPacks.gt(0)
          ? usedPacks.div(installedPacks)
          : new Decimal(0);
        // CALENDAR: the stored charge is an install-time placeholder (~0 at
        // cycle start) — freeze the real in-service accrual (install date →
        // check-in) instead, scaled to the kept fraction. PER_USE: scale the
        // stored per-use charge as before.
        let newCharge: Decimal | null = null;
        if (asset.depreciable) {
          newCharge =
            asset.depreciationMode === "CALENDAR"
              ? installDepreciation(
                  { ...(asset as unknown as InstallChargeRow), returnedAt: when },
                  null,
                  when,
                )
                  .times(usedFraction)
                  .toDecimalPlaces(4)
              : (asset.amortisedCharge ? new Decimal(asset.amortisedCharge) : new Decimal(0))
                  .times(usedFraction)
                  .toDecimalPlaces(4);
        }
        // The returned remainder leaves this install — its captured full cost
        // shrinks with it, so a later policy re-spread stays proportional.
        const newAcquisition =
          asset.acquisitionCost != null
            ? new Decimal(asset.acquisitionCost).times(usedFraction).toDecimalPlaces(4)
            : null;

        await tx.harvestAsset.update({
          where: { id: asset.id },
          data: {
            qty: usedPacks,
            amortisedCharge: newCharge,
            acquisitionCost: newAcquisition,
            returnCondition: parsed.data.condition,
            returnedAt: when,
            returnNote:
              [parsed.data.note, `used ${parsed.data.usedDisplay}`]
                .filter(Boolean)
                .join(" — ") || null,
          },
        });

        await recordAction(tx, {
          type: "harvest.checkin_asset",
          entityType: "HarvestAsset",
          entityId: asset.id,
          description:
            parsed.data.condition === "used"
              ? `Used up in greenhouse — ${parsed.data.usedDisplay || "asset"}`
              : `Returned — ${parsed.data.usedDisplay || "asset"} used (${parsed.data.condition})`,
          userId,
          payload: {
            harvestAssetId: asset.id,
            harvestId: asset.harvestId,
            condition: parsed.data.condition,
            usedQty: parsed.data.usedQty,
            usedDisplay: parsed.data.usedDisplay,
            note: parsed.data.note,
          },
        });

        return asset.harvestId;
      }

      if (parsed.data.condition === "good") {
        await returnAssetSlicesToInventory(tx, asset, when, summary);
      } else {
        // Damaged or Lost — link each source batch back to this harvest so the
        // Financials damage-loss line can show what broke where. Don't create
        // a returned batch.
        for (const c of asset.consumptions) {
          await tx.batch.update({
            where: { id: c.batch.id },
            data: { damagedFromHarvestId: asset.harvestId },
          });
        }
      }

      // Freeze the charge for the in-service window (install → check-in). A
      // CALENDAR asset returned/damaged/lost mid-cycle must bear the
      // depreciation accrued while it was in service — its install-time charge
      // was ~0 (cycleMonths≈0 at cycle start). The residual (remaining book
      // value) stays on the business books by design. No-op for PER_USE, and
      // non-depreciable assets keep their null charge.
      const frozenCharge = asset.depreciable
        ? installDepreciation(
            { ...(asset as unknown as InstallChargeRow), returnedAt: when },
            null,
            when,
          )
        : null;
      await tx.harvestAsset.update({
        where: { id: asset.id },
        data: {
          returnCondition: parsed.data.condition,
          returnedAt: when,
          returnNote: parsed.data.note || null,
          ...(frozenCharge !== null ? { amortisedCharge: frozenCharge } : {}),
        },
      });

      await recordAction(tx, {
        type:
          parsed.data.condition === "good"
            ? "harvest.checkin_asset"
            : "harvest.damage_asset",
        entityType: "HarvestAsset",
        entityId: asset.id,
        description:
          parsed.data.condition === "good"
            ? `Checked in asset (good): ${summary.returned} units returned`
            : `Asset ${parsed.data.condition}: ${parsed.data.note || "no note"}`,
        userId,
        payload: {
          harvestAssetId: asset.id,
          harvestId: asset.harvestId,
          condition: parsed.data.condition,
          summary,
          note: parsed.data.note,
        },
      });

      return asset.harvestId;
    });

    revalidatePath(`/harvest/${harvestId}`);
    revalidatePath("/inventory");
    revalidatePath("/financials");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to check in" };
  }
}

export async function endHarvest(harvestId: string): Promise<ActionResult> {
  const userId = await uid();
  const summary: { returned: number; discarded: number } = { returned: 0, discarded: 0 };
  await prisma.$transaction(async (tx: TransactionClient) => {
    const h = await tx.harvest.findUnique({ where: { id: harvestId } });
    if (!h) throw new Error("Harvest not found");
    // Re-closing a CLOSED cycle would silently move its endDate to today,
    // rewriting cycle-days and every frozen calendar charge.
    if (h.status !== "LIVE") throw new Error("This cycle is already closed");

    // Auto-good every depreciable HarvestAsset that hasn't already been
    // checked in manually. Anything with returnCondition set (good/damaged
    // /lost) was handled by checkInHarvestAsset — skip it.
    const assets = (await tx.harvestAsset.findMany({
      where: { harvestId, depreciable: true, returnCondition: null },
      include: {
        consumptions: {
          include: {
            batch: {
              select: {
                id: true,
                itemId: true,
                supplierId: true,
                price: true,
                exchangeRate: true,
                maxUses: true,
                useCount: true,
                amortisedCostPerUse: true,
                usefulLifeMonths: true,
              },
            },
          },
        },
      },
    })) as AssetRowForReturn[];

    const today = new Date();
    // The cycle's end DATE is Boyd's calendar day in WIB — a 6am Jakarta close
    // is still "today" there even though UTC is on the previous date.
    const endDay = new Date(`${todayWIB()}T00:00:00.000Z`);
    for (const asset of assets) {
      await returnAssetSlicesToInventory(tx, asset, today, summary);
      // Freeze the final depreciation for the closed cycle. CALENDAR assets
      // accrue over time, so their install-time charge (~0 at cycle start) must
      // be recomputed for the full in-service window now that the cycle ends;
      // PER_USE charges are time-independent, so this is a no-op for them.
      const frozen = asset.depreciable
        ? installDepreciation(asset as unknown as InstallChargeRow, today, today)
        : null;
      await tx.harvestAsset.update({
        where: { id: asset.id },
        data: {
          returnCondition: "good",
          returnedAt: today,
          ...(frozen !== null ? { amortisedCharge: frozen } : {}),
        },
      });
    }

    await tx.harvest.update({
      where: { id: harvestId },
      data: { status: "CLOSED", endDate: endDay },
    });
    await recordAction(tx, {
      type: "harvest.end",
      entityType: "Harvest",
      entityId: harvestId,
      description: `Ended harvest: ${h.name}`,
      userId,
      payload: {
        name: h.name,
        depreciation: summary,
      },
    });
  });
  revalidatePath("/harvest");
  revalidatePath(`/harvest/${harvestId}`);
  revalidatePath("/inventory");
  revalidatePath("/financials");
  return { ok: true };
}

const useSchema = z.object({
  harvestId: z.string(),
  itemId: z.string(),
  qty: z.string(),
  displayQty: z.string().optional().default(""),
  date: z.string(),
});

export async function recordHarvestUsage(input: unknown): Promise<ActionResult> {
  const parsed = useSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      const usage = await tx.harvestUsage.create({
        data: {
          harvestId: parsed.data.harvestId,
          itemId: parsed.data.itemId,
          qty: new Decimal(parsed.data.qty),
          displayQty: parsed.data.displayQty || null,
          date: new Date(parsed.data.date),
        },
      });
      const { consumed } = await consumeFifo(tx, parsed.data.itemId, parsed.data.qty);
      const consumptionIds: string[] = [];
      for (const c of consumed) {
        const cc = await tx.batchConsumption.create({
          data: {
            batchId: c.batchId,
            qty: new Decimal(c.qty),
            unitCost: new Decimal(c.unitCost),
            harvestUsageId: usage.id,
          },
        });
        consumptionIds.push(cc.id);
      }
      await recordAction(tx, {
        type: "harvest.use_stock",
        entityType: "HarvestUsage",
        entityId: usage.id,
        description: `Recorded usage on harvest`,
        userId,
        payload: { harvestId: parsed.data.harvestId, usageId: usage.id, consumptionIds },
      });
    });
    revalidatePath(`/harvest/${parsed.data.harvestId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

const installSchema = z.object({
  harvestId: z.string(),
  itemId: z.string(),
  qty: z.string(),
  date: z.string(),
  reusable: z.boolean().default(false),
  condition: z.string().optional().default(""),
});

export async function installHarvestAsset(input: unknown): Promise<ActionResult> {
  const parsed = installSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      const { consumed, totalCost } = await consumeFifo(tx, parsed.data.itemId, parsed.data.qty);
      const fullCost = new Decimal(totalCost);

      // --- Depreciation snapshot ---
      // CALENDAR (batch has a useful life in months) wins: charge the cycle's
      // straight-line share. Else PER_USE (maxUses>1): charge Σ(qty × per-use).
      // Else non-depreciable (full cost already on Business P&L at purchase).
      const hasCalendar = consumed.some((c) => c.batchUsefulLifeMonths && c.batchUsefulLifeMonths > 0);
      const hasPerUse = consumed.some((c) => c.batchMaxUses > 1 && c.amortisedCostPerUse);
      let depreciable = false;
      let charge: Decimal | null = null;
      let snapshotUseCount = 0;
      let snapshotMaxUses = 1;
      let depMode: "PER_USE" | "CALENDAR" | null = null;
      let usefulLifeMonths: number | null = null;

      // The install's captured full cost. FIFO totalCost is 0 when the goods
      // came from returned price-0 batches (PER_USE value rides in
      // amortisedCostPerUse) — recover the implied full so later re-spreads
      // don't zero this install's charge.
      let capturedFullCost = fullCost;

      if (hasCalendar) {
        depreciable = true;
        depMode = "CALENDAR";
        usefulLifeMonths = consumed.find((c) => c.batchUsefulLifeMonths)!.batchUsefulLifeMonths!;
        const h = (await tx.harvest.findUnique({
          where: { id: parsed.data.harvestId },
          select: { endDate: true },
        })) as { endDate: Date | null } | null;
        // Accrue from the INSTALL date, not the cycle start — an asset added
        // mid-cycle must not bear months it wasn't in service. This is a
        // placeholder anyway: every P&L read recomputes live via
        // installDepreciation over the same window.
        const cyc = cycleMonths(new Date(parsed.data.date), h?.endDate ?? null);
        charge = computeAmortised({ mode: "CALENDAR", fullCost, lifeMonths: usefulLifeMonths, cycleMonths: cyc });
      } else if (hasPerUse) {
        depreciable = true;
        depMode = "PER_USE";
        let acc = new Decimal(0);
        let implied = new Decimal(0);
        for (const c of consumed) {
          if (c.batchMaxUses > 1 && c.amortisedCostPerUse) {
            acc = acc.plus(new Decimal(c.qty).times(c.amortisedCostPerUse));
            implied = implied.plus(
              new Decimal(c.qty).times(c.amortisedCostPerUse).times(c.batchMaxUses),
            );
            const next = c.batchUseCountBefore + 1;
            if (next > snapshotUseCount) {
              snapshotUseCount = next;
              snapshotMaxUses = c.batchMaxUses;
            }
          }
        }
        charge = acc.toDecimalPlaces(4);
        if (capturedFullCost.lte(0) && implied.gt(0)) capturedFullCost = implied;
      }

      const asset = await tx.harvestAsset.create({
        data: {
          harvestId: parsed.data.harvestId,
          itemId: parsed.data.itemId,
          qty: new Decimal(parsed.data.qty),
          date: new Date(parsed.data.date),
          reusable: parsed.data.reusable,
          condition: parsed.data.condition || null,
          depreciable,
          amortisedCharge: depreciable ? charge : null,
          acquisitionCost: capturedFullCost.toDecimalPlaces(4),
          useCount: snapshotUseCount,
          maxUses: snapshotMaxUses,
          depreciationMode: depMode,
          usefulLifeMonths,
        },
      });
      const consumptionIds: string[] = [];
      const touchedBatchIds = new Set<string>();
      for (const c of consumed) {
        const cc = await tx.batchConsumption.create({
          data: {
            batchId: c.batchId,
            qty: new Decimal(c.qty),
            unitCost: new Decimal(c.unitCost),
            harvestAssetId: asset.id,
          },
        });
        consumptionIds.push(cc.id);
        // Increment useCount once per source batch so a 5+5 split across two
        // depreciable batches counts as one "use" for each batch.
        if (c.batchMaxUses > 1 && !touchedBatchIds.has(c.batchId)) {
          touchedBatchIds.add(c.batchId);
          await tx.batch.update({
            where: { id: c.batchId },
            data: { useCount: { increment: 1 } },
          });
        }
      }
      await recordAction(tx, {
        type: "harvest.install_asset",
        entityType: "HarvestAsset",
        entityId: asset.id,
        description: `Installed asset on harvest`,
        userId,
        payload: { harvestId: parsed.data.harvestId, assetId: asset.id, consumptionIds },
      });
    });
    revalidatePath(`/harvest/${parsed.data.harvestId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

const saleSchema = z.object({
  harvestId: z.string(),
  produceId: z.string(),
  date: z.string(),
  grade: z.enum(["A", "B", "C", "D"]),
  weight: z.string(),
  pricePerKg: z.string(),
  /** Optional buyer. Null = walk-up / untracked sale. */
  customerId: z.string().optional(),
  /** Optional packaging (a box/bag/container item). When set, the item is
   *  consumed from stock onto the cycle's usage at FIFO cost. */
  packagingItemId: z.string().optional(),
  packagingQty: z.string().optional(),
  /** "included" → packaging is a cost only (sale total unchanged).
   *  "ontop"    → packagingChargePerUnit × qty is added to the sale total. */
  packagingMode: z.enum(["included", "ontop"]).optional(),
  /** What the customer pays per packaging unit when mode = "ontop"
   *  (defaults to cost on the client, but editable). */
  packagingChargePerUnit: z.string().optional(),
  /** Optional override of the charged total (discount/markup). Wins over the
   *  computed weight×price (+ on-top packaging); weight + price/kg stay
   *  recorded so yield/COGS reporting stays accurate. */
  amountOverride: z.string().optional(),
  /** Charity donation — recorded as income (owner's company pays, default
   *  50k/kg) and highlighted in the charity reporting. */
  charity: z.boolean().optional(),
  /** Only meaningful once the produce has a recorded harvested total.
   *  true  → sale comes from the unsold-on-hand pool: total stays put, the
   *          derived unsold shrinks (clamped so it never goes negative).
   *  false → freshly picked: the harvested total grows by the sale weight so
   *          the unsold pool is untouched.
   *  undefined → legacy behaviour (no adjustment). */
  fromUnsold: z.boolean().optional(),
  charityRecipient: z.string().max(120).optional(),
});

export async function logSale(input: unknown): Promise<ActionResult> {
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  const d = parsed.data;
  try {
    // Single verified sale-creation path, shared with the POS register.
    await prisma.$transaction(async (tx: TransactionClient) => {
      await createSaleTx(tx, d, { userId, paymentStatus: "PAID" });
      if (d.fromUnsold !== undefined) {
        // "Freshly picked" grows the total by the sale weight; "from unsold"
        // leaves it (the derived pool shrinks by itself) but still clamps.
        await adjustHarvestedTotal(
          tx,
          d.harvestId,
          d.produceId,
          d.fromUnsold === false ? new Decimal(d.weight) : new Decimal(0),
        );
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to log sale" };
  }
  revalidatePath(`/harvest/${d.harvestId}`);
  revalidatePath("/sales");
  return { ok: true };
}


// ============================================================================
// Dispositions — non-sale fates of harvested produce (breakage/spillage, staff
// consumption, giveaways/samples). Recorded just like a sale but carry NO cash:
// `pricePerKg` is an optional memo only. They make total yield reconcile.
// ============================================================================

const dispositionSchema = z.object({
  harvestId: z.string(),
  produceId: z.string().min(1, "Pick a produce"),
  type: z.enum(["BREAKAGE", "STAFF", "GIVEAWAY"]),
  weight: z
    .string()
    .refine((v) => /^[0-9]*\.?[0-9]+$/.test(v.trim()) && Number(v) > 0, "Enter a weight in kg"),
  date: z.string().min(1),
  /** Optional memo value (Rp/kg) at list price. Display only — no cash impact. */
  pricePerKg: z.string().optional(),
  /** Optional: which staff member consumed it (STAFF type). */
  staffId: z.string().optional(),
  /** Optional: who received the sample (GIVEAWAY type). */
  customerId: z.string().optional(),
  note: z.string().optional(),
});

export async function logDisposition(input: unknown): Promise<ActionResult> {
  const parsed = dispositionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const userId = await uid();
  const d = parsed.data;
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      const disp = await tx.harvestDisposition.create({
        data: {
          harvestId: d.harvestId,
          produceId: d.produceId,
          type: d.type,
          weight: new Decimal(d.weight),
          // Only keep the picked party for the relevant type, so a stale value
          // from a switched type doesn't leak in.
          pricePerKg: hasOverride(d.pricePerKg) ? new Decimal(d.pricePerKg) : null,
          staffId: d.type === "STAFF" ? d.staffId || null : null,
          customerId: d.type === "GIVEAWAY" ? d.customerId || null : null,
          note: d.note?.trim() || null,
          date: new Date(d.date),
        },
      });
      await recordAction(tx, {
        type: "harvest.log_disposition",
        entityType: "HarvestDisposition",
        entityId: disp.id,
        description: `Logged ${d.type.toLowerCase()} disposition`,
        userId,
        payload: { harvestId: d.harvestId, dispositionId: disp.id, type: d.type },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to log" };
  }
  revalidatePath(`/harvest/${d.harvestId}`);
  return { ok: true };
}

/** Edit an existing disposition in place (note, weight, produce, who, value).
 *  The `type` stays put (the row keeps its section); it's passed only so the
 *  staff/customer fields are gated to the right kind. */
const updateDispositionSchema = dispositionSchema.omit({ harvestId: true });

export async function updateDisposition(id: string, input: unknown): Promise<ActionResult> {
  const parsed = updateDispositionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const d = parsed.data;
  const disp = await prisma.harvestDisposition.update({
    where: { id },
    data: {
      produceId: d.produceId,
      weight: new Decimal(d.weight),
      pricePerKg: hasOverride(d.pricePerKg) ? new Decimal(d.pricePerKg) : null,
      staffId: d.type === "STAFF" ? d.staffId || null : null,
      customerId: d.type === "GIVEAWAY" ? d.customerId || null : null,
      note: d.note?.trim() || null,
      date: new Date(d.date),
    },
  });
  revalidatePath(`/harvest/${disp.harvestId}`);
  return { ok: true };
}

export async function deleteDisposition(id: string): Promise<ActionResult> {
  const userId = await uid();
  try {
    const disp = await prisma.harvestDisposition.findUnique({ where: { id } });
    if (!disp) return { ok: false, error: "Not found" };
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.harvestDisposition.delete({ where: { id } });
      await recordAction(tx, {
        type: "harvest.delete_disposition",
        entityType: "HarvestDisposition",
        entityId: id,
        description: `Deleted a breakage/staff/giveaway entry`,
        userId,
        payload: snapshot(disp),
      });
    });
    if (disp.harvestId) revalidatePath(`/harvest/${disp.harvestId}`);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't delete this entry" };
  }
  return { ok: true };
}

// ============================================================================
// Customers (who we sell to) — mirror of supplier quick-create. Search-first,
// create ad-hoc from the Log-sale dialog. Type drives later reporting.
// ============================================================================

const CUSTOMER_TYPES = ["RETAILER", "WHOLESALER", "CONSUMER"] as const;

const createCustomerSchema = z.object({
  name: z.string().min(1),
  type: z.enum(CUSTOMER_TYPES).default("CONSUMER"),
});

export async function createCustomerQuick(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string; type: string }>> {
  const parsed = createCustomerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Name is required" };
  const trimmed = parsed.data.name.trim();
  if (!trimmed) return { ok: false, error: "Name is required" };
  const userId = await uid();
  try {
    // Find-or-create: return an existing same-name customer (case-insensitive)
    // instead of erroring on the new unique constraint, so a double-tap or a
    // re-typed name reuses the row rather than failing (app review #38).
    const existing = (await prisma.customer.findFirst({
      where: { name: { equals: trimmed, mode: "insensitive" } },
      select: { id: true, name: true, type: true },
    })) as { id: string; name: string; type: string } | null;
    if (existing) {
      revalidatePath("/sales");
      return { ok: true, data: existing };
    }
    const customer = await prisma.$transaction(async (tx: TransactionClient) => {
      const created = await tx.customer.create({
        data: { name: trimmed, type: parsed.data.type },
      });
      await recordAction(tx, {
        type: "customer.create",
        entityType: "Customer",
        entityId: created.id,
        description: `Added customer (quick): ${trimmed} (${parsed.data.type.toLowerCase()})`,
        userId,
        payload: { name: trimmed, type: parsed.data.type, source: "quick" },
      });
      return created;
    });
    revalidatePath("/sales");
    return { ok: true, data: { id: customer.id, name: customer.name, type: customer.type } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create customer" };
  }
}

const labourOverrideSchema = z.object({
  harvestId: z.string().min(1),
  /** Manual labour cost in IDR. Empty/null clears the override (back to
   *  computed hours×rate). Digits only (whole rupiah). */
  amount: z.string().regex(/^\d+(\.\d+)?$/).optional().nullable(),
  note: z.string().max(200).optional().nullable(),
});

/**
 * Set (or clear) the manual labour-cost override on a harvest. When an amount
 * is given it REPLACES the computed hours×rate labour in the P&L; passing
 * null/empty clears it back to the computed figure.
 */
export async function setHarvestLabourOverride(input: unknown): Promise<ActionResult> {
  // Overriding labour rewrites the cycle's P&L — owner only, same rule as
  // every other money-changing action (authz.ts).
  const gate = await requireSuperuser();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = labourOverrideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = gate.userId;
  // Org-scoped existence check (findFirst goes through the tenancy extension),
  // so a cross-org harvest id can't be targeted.
  const owned = await prisma.harvest.findFirst({
    where: { id: parsed.data.harvestId },
    select: { id: true },
  });
  if (!owned) return { ok: false, error: "Cycle not found" };
  const amount =
    parsed.data.amount && parsed.data.amount.trim() !== "" ? parsed.data.amount.trim() : null;
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.harvest.update({
        where: { id: parsed.data.harvestId },
        data: {
          manualLabourCost: amount,
          manualLabourNote: amount ? parsed.data.note?.trim() || null : null,
        },
      });
      await recordAction(tx, {
        type: "harvest.labour_override",
        entityType: "Harvest",
        entityId: parsed.data.harvestId,
        description: amount ? `Set manual labour cost to ${amount}` : "Cleared manual labour cost",
        userId,
        payload: { amount, note: parsed.data.note ?? null },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save the labour override" };
  }
  revalidatePath(`/harvest/${parsed.data.harvestId}`);
  revalidatePath("/financials");
  return { ok: true };
}

/** All customers for the active org — drives the Log-sale picker. */
export async function listCustomers(): Promise<
  { id: string; name: string; type: string; email: string | null }[]
> {
  const rows = (await prisma.customer.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, email: true },
  })) as { id: string; name: string; type: string; email: string | null }[];
  return rows;
}
