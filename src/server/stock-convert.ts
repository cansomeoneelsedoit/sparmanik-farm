import { Decimal } from "@/server/decimal";

/**
 * Pure conversion math for re-denominating pack-based stock into sub-units
 * (the Combine feature: "25 kg bag" + "1 kg bag" → one item measured in kg).
 *
 * The single invariant that must NEVER break: money doesn't move. For any
 * batch, qty × price (total purchase cost) is identical before and after
 * rescaling; for any consumption, qty × unitCost (total cost of what was
 * used) is identical too. Quantity scales UP by the pack factor, money per
 * unit scales DOWN by the same factor.
 *
 * Kept as pure functions so vitest can hammer them with property tests —
 * see stock-convert.test.ts.
 */

export type BatchScalars = {
  qty: Decimal;
  price: Decimal;
  amortisedCostPerUse: Decimal | null;
};

export type ConsumptionScalars = {
  qty: Decimal;
  unitCost: Decimal;
};

/** Rescale a pack-denominated batch into sub-units: qty × factor, price ÷ factor. */
export function rescaleBatchToSubUnits(
  b: BatchScalars,
  factor: Decimal,
): BatchScalars {
  return {
    qty: new Decimal(b.qty).times(factor),
    price: new Decimal(b.price).div(factor),
    amortisedCostPerUse: b.amortisedCostPerUse
      ? new Decimal(b.amortisedCostPerUse).div(factor)
      : null,
  };
}

/**
 * Rescale a consumption row to match its rescaled batch. If the batch's qty
 * was multiplied by `factor`, every consumption against it must be too —
 * otherwise `remaining = qty − Σ consumptions` mixes packs with sub-units
 * and invents phantom stock.
 */
export function rescaleConsumptionToSubUnits(
  c: ConsumptionScalars,
  factor: Decimal,
): ConsumptionScalars {
  return {
    qty: new Decimal(c.qty).times(factor),
    unitCost: new Decimal(c.unitCost).div(factor),
  };
}

/** Remaining stock of a batch given its consumptions (shared definition). */
export function batchRemaining(
  qty: Decimal,
  consumptions: { qty: Decimal }[],
): Decimal {
  const used = consumptions.reduce(
    (s, c) => s.plus(new Decimal(c.qty)),
    new Decimal(0),
  );
  return new Decimal(qty).minus(used);
}
