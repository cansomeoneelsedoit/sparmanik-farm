import { Decimal, type TransactionClient } from "@/server/decimal";

/**
 * Asset depreciation engine. Two ways a reusable asset's cost is spread over
 * its life:
 *   - PER_USE  (consumables, e.g. twine that lasts 4 uses): each use/harvest is
 *              charged fullCost / uses.
 *   - CALENDAR (equipment, e.g. a TDS meter that lasts 24 months): straight-
 *              line — each harvest cycle bears the depreciation accrued over the
 *              cycle's own duration = (fullCost / lifeMonths) × cycleMonths.
 *   - NONE     charges the harvest nothing (a fixed asset; its full cost already
 *              sat on the Business P&L when it was bought).
 *
 * The policy lives on the Item and is snapshotted onto Batches (for future
 * installs) and HarvestAssets (each install's charge). Changing an item's
 * policy re-derives every existing install's charge from its captured
 * acquisitionCost — idempotent, so it can be re-applied safely.
 */

export type DepreciationMode = "NONE" | "PER_USE" | "CALENDAR";

const AVG_DAYS_PER_MONTH = 30.4375;

/** Fractional months a harvest cycle spans (start → end, or start → now while
 *  the cycle is still live). Never negative. */
export function cycleMonths(start: Date, end: Date | null, now: Date = new Date()): Decimal {
  const to = end ?? now;
  const days = Math.max(0, (to.getTime() - start.getTime()) / 86_400_000);
  return new Decimal(days).div(AVG_DAYS_PER_MONTH);
}

/** The charge one harvest install bears under a policy. null = not depreciable. */
export function amortisedCharge(params: {
  mode: DepreciationMode;
  fullCost: Decimal;
  uses?: number | null;
  lifeMonths?: number | null;
  cycleMonths?: Decimal | null;
}): Decimal | null {
  const { mode, fullCost } = params;
  if (mode === "PER_USE") {
    const n = params.uses && params.uses > 0 ? params.uses : 1;
    return fullCost.div(n).toDecimalPlaces(4);
  }
  if (mode === "CALENDAR") {
    const life = params.lifeMonths && params.lifeMonths > 0 ? params.lifeMonths : 1;
    const cyc = params.cycleMonths ?? new Decimal(0);
    const charge = fullCost.div(life).times(cyc);
    // A cycle never charges more than the asset's whole value.
    return Decimal.min(charge, fullCost).toDecimalPlaces(4);
  }
  return null;
}

/** The minimal asset shape the live-charge computation needs. */
export type InstallChargeRow = {
  depreciationMode: string | null;
  amortisedCharge: Decimal | string | null;
  acquisitionCost: Decimal | string | null;
  usefulLifeMonths: number | null;
  /** Install date — when the asset went into service on this harvest. */
  date: Date;
  /** Set once the asset is checked in / damaged / lost — stops the clock. */
  returnedAt: Date | null;
};

/**
 * The depreciation a single asset install CURRENTLY bears on its harvest.
 *
 * PER_USE / legacy: the stored per-use charge (time-independent — return as-is).
 * CALENDAR: recomputed live from the in-service window so it accrues while the
 *   cycle runs and is final once the cycle closes or the asset is returned:
 *     in service = install date → (returnedAt ?? harvest end ?? now)
 *     charge     = fullCost / lifeMonths × inServiceMonths   (capped at fullCost)
 *
 * This is the single source of truth for calendar depreciation. Reading the
 * stored `amortisedCharge` alone is wrong for calendar assets: it's frozen at
 * install (≈0, since cycleMonths≈0 at cycle start), so the harvest would
 * under-charge for its whole life and — because the full cost is excluded from
 * COGS — the depreciation would effectively vanish. Damaged/lost calendar
 * assets would likewise charge 0. Recomputing here fixes both.
 */
export function installDepreciation(
  a: InstallChargeRow,
  harvestEnd: Date | null,
  now: Date = new Date(),
): Decimal {
  if (a.depreciationMode === "CALENDAR") {
    // acquisitionCost can be a STORED ZERO for installs drawn from returned
    // price-0 batches — treat 0 the same as missing, not as a real cost.
    const acq = a.acquisitionCost != null ? new Decimal(a.acquisitionCost) : null;
    const fullCost =
      acq && acq.gt(0)
        ? acq
        : a.amortisedCharge != null
          ? new Decimal(a.amortisedCharge)
          : new Decimal(0);
    const end = a.returnedAt ?? harvestEnd ?? now;
    const charge = amortisedCharge({
      mode: "CALENDAR",
      fullCost,
      lifeMonths: a.usefulLifeMonths,
      cycleMonths: cycleMonths(a.date, end, now),
    });
    return charge ?? new Decimal(0);
  }
  return a.amortisedCharge != null ? new Decimal(a.amortisedCharge) : new Decimal(0);
}

type InstallRow = {
  id: string;
  amortisedCharge: Decimal | string | null;
  acquisitionCost: Decimal | string | null;
  maxUses: number;
  date: Date;
  returnedAt: Date | null;
  harvest: { startDate: Date; endDate: Date | null };
  consumptions: { qty: Decimal | string; unitCost: Decimal | string }[];
};

/** The full acquisition cost of an install, preferring the captured value, then
 *  FIFO consumptions, then a legacy fallback (charge × maxUses). A stored ZERO
 *  acquisitionCost (installs drawn from returned price-0 batches) counts as
 *  missing — otherwise a re-spread would wipe that install's charge to 0. */
function fullCostOf(a: InstallRow): Decimal {
  if (a.acquisitionCost != null && new Decimal(a.acquisitionCost).gt(0)) {
    return new Decimal(a.acquisitionCost);
  }
  const fifo = a.consumptions.reduce(
    (s, c) => s.plus(new Decimal(c.qty).times(new Decimal(c.unitCost))),
    new Decimal(0),
  );
  if (fifo.gt(0)) return fifo;
  return new Decimal(a.amortisedCharge ?? 0).times(a.maxUses || 1);
}

/**
 * Apply a depreciation policy to an item: update the item, snapshot it onto its
 * batches (so future installs inherit it), and re-spread every existing
 * harvest install's charge from its full cost. Runs inside a transaction.
 */
export async function applyItemDepreciationPolicy(
  tx: TransactionClient,
  itemId: string,
  mode: DepreciationMode,
  opts: { uses?: number | null; months?: number | null },
): Promise<{ installsUpdated: number }> {
  const uses = mode === "PER_USE" ? Math.max(1, Math.floor(opts.uses ?? 1)) : null;
  const months = mode === "CALENDAR" ? Math.max(1, Math.floor(opts.months ?? 1)) : null;

  // 1. Item policy (+ reusable flag so the rest of the app treats it as one).
  await tx.item.update({
    where: { id: itemId },
    data: {
      depreciationMode: mode,
      depreciationUses: uses,
      depreciationMonths: months,
      reusable: mode !== "NONE",
    },
  });

  // 2. Batches — snapshot so future FIFO installs pick up the policy.
  const batches = (await tx.batch.findMany({
    where: { itemId },
    select: { id: true, price: true, maxUses: true, amortisedCostPerUse: true },
  })) as {
    id: string;
    price: Decimal | string;
    maxUses: number;
    amortisedCostPerUse: Decimal | string | null;
  }[];
  for (const b of batches) {
    if (mode === "PER_USE") {
      // Returned batches carry price=0 (their value was already charged); their
      // full cost must be recovered from the OLD schedule (per-use × old uses),
      // otherwise re-applying a policy would zero their remaining-use charges.
      const fullUnitCost = new Decimal(b.price).gt(0)
        ? new Decimal(b.price)
        : new Decimal(b.amortisedCostPerUse ?? 0).times(b.maxUses || 1);
      await tx.batch.update({
        where: { id: b.id },
        data: {
          maxUses: uses!,
          amortisedCostPerUse: fullUnitCost.div(uses!).toDecimalPlaces(4),
          usefulLifeMonths: null,
        },
      });
    } else {
      // Leaving PER_USE: a returned batch's remaining value lives ONLY in
      // amortisedCostPerUse (price=0 by design). Before nulling it, promote
      // that value into price so the batch's worth isn't silently destroyed
      // and CALENDAR/NONE installs from it still carry a real cost.
      const recovered =
        new Decimal(b.price).lte(0) && b.amortisedCostPerUse
          ? new Decimal(b.amortisedCostPerUse).times(b.maxUses || 1).toDecimalPlaces(4)
          : null;
      await tx.batch.update({
        where: { id: b.id },
        data: {
          maxUses: 1,
          amortisedCostPerUse: null,
          usefulLifeMonths: mode === "CALENDAR" ? months! : null,
          ...(recovered && recovered.gt(0) ? { price: recovered } : {}),
        },
      });
    }
  }

  // 3. Re-spread EXISTING installs from their captured full cost.
  const installs = (await tx.harvestAsset.findMany({
    where: { itemId },
    select: {
      id: true,
      amortisedCharge: true,
      acquisitionCost: true,
      maxUses: true,
      date: true,
      returnedAt: true,
      harvest: { select: { startDate: true, endDate: true } },
      consumptions: { select: { qty: true, unitCost: true } },
    },
  })) as InstallRow[];

  for (const a of installs) {
    const fullCost = fullCostOf(a);
    // CALENDAR charges accrue over the install's own in-service window
    // (install date → checked-in / cycle end / now) — same window as
    // installDepreciation, so re-spread and live reads agree.
    const cyc =
      mode === "CALENDAR"
        ? cycleMonths(a.date, a.returnedAt ?? a.harvest.endDate)
        : null;
    const charge = amortisedCharge({ mode, fullCost, uses, lifeMonths: months, cycleMonths: cyc });
    await tx.harvestAsset.update({
      where: { id: a.id },
      data: {
        acquisitionCost: fullCost.toDecimalPlaces(4),
        depreciable: mode !== "NONE",
        amortisedCharge: charge,
        maxUses: mode === "PER_USE" ? uses! : 1,
        depreciationMode: mode === "NONE" ? null : mode,
        usefulLifeMonths: months,
      },
    });
  }

  return { installsUpdated: installs.length };
}
