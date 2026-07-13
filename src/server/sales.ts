import { recordAction } from "@/server/audit";
import { consumeFifo } from "@/server/fifo";
import { Decimal, type TransactionClient } from "@/server/decimal";

/**
 * Shared produce-sale creation, extracted from `logSale` so both the per-sale
 * dialog (harvest/actions.ts) and the POS register (pos/actions.ts) create sales
 * through ONE verified path. This is a plain server module — NOT a "use server"
 * action file — because it takes a Prisma transaction client (not serializable),
 * so it can't live alongside server actions.
 */

/** A single produce line to record as a Sale. */
export type SaleLineInput = {
  harvestId: string;
  produceId: string;
  /** YYYY-MM-DD (WIB). */
  date: string;
  grade: "A" | "B" | "C" | "D";
  weight: string;
  pricePerKg: string;
  customerId?: string | null;
  /** Optional packaging (box/bag) consumed from stock onto the cycle at FIFO cost. */
  packagingItemId?: string;
  packagingQty?: string;
  packagingMode?: "included" | "ontop";
  packagingChargePerUnit?: string;
  /** Override of the charged total (discount/markup). Wins over weight×price. */
  amountOverride?: string;
  /** Charity donation — still recorded as income; flagged for the charity
   *  highlight in reporting. */
  charity?: boolean;
  /** Optional: which charity/organisation received the produce. */
  charityRecipient?: string | null;
  /** Where the produce came from when the crop tracks an unsold pool:
   *  true = the unsold-on-hand pile, false = freshly picked (grew the
   *  harvested total). Stored on the sale so deletes/edits can reverse the
   *  pool bookkeeping. undefined/null = untracked (legacy, POS). */
  fromUnsold?: boolean;
};

/** True when the override string is a usable number we should apply. */
export function hasOverride(v: string | undefined): v is string {
  return v !== undefined && v.trim() !== "" && /^[0-9]+(\.[0-9]+)?$/.test(v.trim());
}

/**
 * Pool bookkeeping for a produce that tracks an unsold pile (harvestedKg set).
 * Shifts the harvested total by `deltaKg` (0 = clamp only) and clamps it so it
 * never drops below what's already sold + given away — the derived unsold can
 * never go negative. Serialised per (harvest, produce) with an advisory lock so
 * two tablets logging sales at once can't lose an adjustment. No-op when the
 * produce has no recorded total. Shared by logSale/updateSale/deleteSale, the
 * POS register, and the undo handlers.
 */
export async function adjustHarvestedTotal(
  tx: TransactionClient,
  harvestId: string,
  produceId: string,
  deltaKg: Decimal,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${harvestId}:${produceId}:pool`}))`;
  const hp = (await tx.harvestProduce.findUnique({
    where: { harvestId_produceId: { harvestId, produceId } },
    select: { harvestedKg: true },
  })) as { harvestedKg: Decimal | null } | null;
  if (hp?.harvestedKg == null) return;

  const [soldAgg, dispAgg] = await Promise.all([
    tx.sale.aggregate({ where: { harvestId, produceId }, _sum: { weight: true } }),
    tx.harvestDisposition.aggregate({ where: { harvestId, produceId }, _sum: { weight: true } }),
  ]);
  const gone = new Decimal(soldAgg._sum.weight ?? 0).plus(new Decimal(dispAgg._sum.weight ?? 0));

  const next = Decimal.max(new Decimal(hp.harvestedKg).plus(deltaKg), gone).toDecimalPlaces(4);
  if (!next.equals(new Decimal(hp.harvestedKg))) {
    await tx.harvestProduce.update({
      where: { harvestId_produceId: { harvestId, produceId } },
      data: { harvestedKg: next },
    });
  }
}

/**
 * Split a POS basket's custom total across its lines pro-rata (works for a
 * discount OR a markup). Each line is FLOORED to whole rupiah and the LAST line
 * absorbs the rounding remainder, so the returned per-line overrides sum EXACTLY
 * to `target`. Returns undefined overrides (each line computes its own amount)
 * when there's no custom total, it's negative, or it equals the natural total.
 */
export function distributeCartTotal(
  naturals: Decimal[],
  target: Decimal | null,
): { overrides: (string | undefined)[]; gross: Decimal } {
  const naturalTotal = naturals.reduce((s, a) => s.plus(a), new Decimal(0));
  // Rupiah has no sub-unit — round any fractional custom total to whole rupiah
  // so the stored gross always equals the (whole-rupiah) sum of the line rows.
  const t = target === null ? null : target.toDecimalPlaces(0);
  if (t === null || t.lt(0) || naturalTotal.lte(0) || t.equals(naturalTotal)) {
    return { overrides: naturals.map(() => undefined), gross: naturalTotal };
  }
  let allocated = new Decimal(0);
  const overrides = naturals.map((amt, i) => {
    if (i === naturals.length - 1) {
      const last = t.minus(allocated);
      return (last.gt(0) ? last : new Decimal(0)).toFixed(0);
    }
    const share = amt.div(naturalTotal).times(t).toDecimalPlaces(0, Decimal.ROUND_DOWN);
    allocated = allocated.plus(share);
    return share.toFixed(0);
  });
  return { overrides, gross: t };
}

/**
 * Create one Sale row (plus, if packaging is specified, the FIFO stock
 * consumption onto the cycle's usage) inside an existing transaction. Returns
 * the new sale id and the charged amount.
 *
 * `paymentStatus` defaults to PAID (cash / record-only, settled immediately);
 * pass PENDING for a live QRIS/Square charge awaiting webhook confirmation.
 * `paymentId` links the line to its POS basket payment.
 */
export async function createSaleTx(
  tx: TransactionClient,
  d: SaleLineInput,
  opts: {
    userId: string | null;
    paymentStatus?: "PENDING" | "PAID";
    paymentId?: string | null;
  },
): Promise<{ saleId: string; amount: Decimal }> {
  const hasPackaging = !!(d.packagingItemId && d.packagingQty && Number(d.packagingQty) > 0);
  const weight = new Decimal(d.weight);
  const price = new Decimal(d.pricePerKg);
  let amount = weight.times(price);

  // Packaging charged "on top" adds to the sale total (revenue). Track it
  // separately so discount stats can exclude it — otherwise a boxed sale reads
  // as a markup and cancels real discounts (app review #15).
  let packagingCharge = new Decimal(0);
  if (hasPackaging && d.packagingMode === "ontop") {
    packagingCharge = new Decimal(d.packagingChargePerUnit || "0").times(d.packagingQty as string);
    amount = amount.plus(packagingCharge);
  }

  // Manual total override (discount/markup) wins over the computed total. weight
  // + price are still stored so yield/reporting stay honest. The override is a
  // single figure with no known packaging split, so zero the stored
  // packagingCharge — otherwise "produce charged = amount − packaging" could go
  // negative and overstate the discount (review follow-up).
  if (hasOverride(d.amountOverride)) {
    amount = new Decimal(d.amountOverride);
    packagingCharge = new Decimal(0);
  }

  const sale = await tx.sale.create({
    data: {
      harvestId: d.harvestId,
      produceId: d.produceId,
      date: new Date(d.date),
      grade: d.grade,
      weight,
      pricePerKg: price,
      amount,
      packagingCharge,
      customerId: d.customerId || null,
      paymentStatus: opts.paymentStatus ?? "PAID",
      paymentId: opts.paymentId ?? null,
      charity: !!d.charity,
      charityRecipient: d.charity ? d.charityRecipient?.trim() || null : null,
      fromUnsold: d.fromUnsold ?? null,
    },
  });
  await recordAction(tx, {
    type: "harvest.log_sale",
    entityType: "Sale",
    entityId: sale.id,
    description: `Logged sale`,
    userId: opts.userId,
    payload: { harvestId: d.harvestId, saleId: sale.id, customerId: d.customerId ?? null },
  });

  // Consume the packaging from inventory onto this cycle's usage (FIFO cost).
  // This is the real cost; the on-top charge above is the revenue.
  if (hasPackaging) {
    const { consumed } = await consumeFifo(tx, d.packagingItemId as string, d.packagingQty as string);
    const usage = await tx.harvestUsage.create({
      data: {
        harvestId: d.harvestId,
        itemId: d.packagingItemId as string,
        qty: new Decimal(d.packagingQty as string),
        displayQty: `${d.packagingQty} for sale packaging`,
        date: new Date(d.date),
      },
    });
    for (const c of consumed) {
      await tx.batchConsumption.create({
        data: {
          batchId: c.batchId,
          qty: new Decimal(c.qty),
          unitCost: new Decimal(c.unitCost),
          harvestUsageId: usage.id,
        },
      });
    }
    await recordAction(tx, {
      type: "harvest.use_stock",
      entityType: "HarvestUsage",
      entityId: usage.id,
      description: `Packaging used for sale`,
      userId: opts.userId,
      payload: { harvestId: d.harvestId, usageId: usage.id, viaSale: sale.id },
    });
  }

  return { saleId: sale.id, amount };
}
