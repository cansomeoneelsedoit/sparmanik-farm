import { Decimal, type TransactionClient } from "@/server/decimal";

export type FifoConsumption = {
  batchId: string;
  qty: string;
  unitCost: string;
  // --- Depreciation metadata snapshot from the source batch ---
  // batchMaxUses is always present (defaults to 1 for non-depreciable batches).
  // batchUseCountBefore is the batch's useCount BEFORE this consumption — the
  // caller increments it on install, and a HarvestAsset's snapshot useCount
  // becomes batchUseCountBefore + 1.
  // amortisedCostPerUse is null when maxUses = 1.
  batchMaxUses: number;
  batchUseCountBefore: number;
  amortisedCostPerUse: string | null;
};

export type FifoResult = {
  consumed: FifoConsumption[];
  totalCost: string;
};

/**
 * Consume `qtyNeeded` of `itemId` using FIFO, drawing from the oldest batches
 * with remaining quantity. Returns a list of {batchId, qty, unitCost, ...}
 * entries which the caller persists into BatchConsumption rows.
 *
 * Each entry also carries the source batch's depreciation snapshot so the
 * caller can:
 *   - decide whether the install creates a depreciable HarvestAsset
 *   - compute amortised_charge = Σ(qty * amortisedCostPerUse)
 *   - increment batch.useCount on install
 *
 * Throws if there is insufficient stock.
 */
export async function consumeFifo(
  tx: TransactionClient,
  itemId: string,
  qtyNeeded: Decimal | string | number,
): Promise<FifoResult> {
  const needed = new Decimal(qtyNeeded);
  if (needed.lte(0)) throw new Error("FIFO consume: qty must be positive");

  const batches = await tx.batch.findMany({
    where: { itemId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: { consumptions: { select: { qty: true } } },
  });

  let remainingNeeded = new Decimal(needed);
  const consumed: FifoConsumption[] = [];
  let totalCost = new Decimal(0);

  for (const batch of batches) {
    if (remainingNeeded.lte(0)) break;
    const consumedSoFar = batch.consumptions.reduce(
      (sum: Decimal, c: { qty: Decimal }) => sum.plus(c.qty),
      new Decimal(0),
    );
    const available = new Decimal(batch.qty).minus(consumedSoFar);
    if (available.lte(0)) continue;

    const take = Decimal.min(available, remainingNeeded);
    const unitCost = new Decimal(batch.price);
    const lineCost = take.times(unitCost);

    consumed.push({
      batchId: batch.id,
      qty: take.toFixed(4),
      unitCost: unitCost.toFixed(4),
      batchMaxUses: batch.maxUses ?? 1,
      batchUseCountBefore: batch.useCount ?? 0,
      amortisedCostPerUse: batch.amortisedCostPerUse
        ? new Decimal(batch.amortisedCostPerUse).toFixed(4)
        : null,
    });
    totalCost = totalCost.plus(lineCost);
    remainingNeeded = remainingNeeded.minus(take);
  }

  if (remainingNeeded.gt(0)) {
    throw new Error(
      `Insufficient stock: need ${needed.toString()}, short by ${remainingNeeded.toString()}`,
    );
  }

  return { consumed, totalCost: totalCost.toFixed(4) };
}

export async function totalStock(tx: TransactionClient, itemId: string): Promise<Decimal> {
  const batches = await tx.batch.findMany({
    where: { itemId },
    select: { qty: true, consumptions: { select: { qty: true } } },
  });
  return batches.reduce((sum: Decimal, batch: { qty: Decimal; consumptions: { qty: Decimal }[] }) => {
    const consumed = batch.consumptions.reduce((s: Decimal, c: { qty: Decimal }) => s.plus(c.qty), new Decimal(0));
    return sum.plus(new Decimal(batch.qty).minus(consumed));
  }, new Decimal(0));
}

export async function totalValue(tx: TransactionClient, itemId: string): Promise<Decimal> {
  const batches = await tx.batch.findMany({
    where: { itemId },
    select: { qty: true, price: true, consumptions: { select: { qty: true } } },
  });
  return batches.reduce((sum: Decimal, batch: { qty: Decimal; price: Decimal; consumptions: { qty: Decimal }[] }) => {
    const consumed = batch.consumptions.reduce((s: Decimal, c: { qty: Decimal }) => s.plus(c.qty), new Decimal(0));
    const remaining = new Decimal(batch.qty).minus(consumed);
    return sum.plus(remaining.times(batch.price));
  }, new Decimal(0));
}

export async function avgCost(tx: TransactionClient, itemId: string): Promise<Decimal> {
  const stock = await totalStock(tx, itemId);
  if (stock.lte(0)) return new Decimal(0);
  const value = await totalValue(tx, itemId);
  return value.div(stock);
}
