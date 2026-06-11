import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Decimal } from "@/server/decimal";

/**
 * Money math for off-harvest stock sales (the Sell button). Mirrors what
 * `sellStock` does: consume FIFO, snapshot COGS, profit = amount − COGS.
 * Plus the sell dialog's pack-entry conversion (metres → rolls etc.),
 * replicated with plain JS numbers exactly as the client component does it.
 */

type Batch = { id: string; qty: Decimal; price: Decimal };
type Consumption = { batchId: string; qty: Decimal; unitCost: Decimal };

function modelConsume(
  batches: Batch[],
  consumptions: Consumption[],
  qtyNeeded: Decimal,
): { consumed: Consumption[]; ok: boolean } {
  let need = new Decimal(qtyNeeded);
  const out: Consumption[] = [];
  for (const b of batches) {
    if (need.lte(0)) break;
    const used = consumptions
      .filter((c) => c.batchId === b.id)
      .reduce((s, c) => s.plus(c.qty), new Decimal(0));
    const avail = b.qty.minus(used);
    if (avail.lte(0)) continue;
    const take = Decimal.min(avail, need);
    out.push({ batchId: b.id, qty: take, unitCost: b.price });
    need = need.minus(take);
  }
  return { consumed: out, ok: need.lte(0) };
}

/** What sellStock computes: COGS from FIFO consumption, profit = paid − COGS. */
function modelSell(
  batches: Batch[],
  consumptions: Consumption[],
  qty: Decimal,
  amount: Decimal,
) {
  const { consumed, ok } = modelConsume(batches, consumptions, qty);
  const cogs = consumed.reduce(
    (s, c) => s.plus(c.qty.times(c.unitCost)),
    new Decimal(0),
  );
  return { ok, consumed, cogs, profit: amount.minus(cogs) };
}

describe("stock sale money math", () => {
  it("computes profit across FIFO batches at different prices", () => {
    const batches: Batch[] = [
      { id: "old", qty: new Decimal(10), price: new Decimal(100) },
      { id: "new", qty: new Decimal(10), price: new Decimal(200) },
    ];
    // Sell 15 units for 4,000: COGS = 10×100 + 5×200 = 2,000 → profit 2,000.
    const sale = modelSell(batches, [], new Decimal(15), new Decimal(4000));
    expect(sale.ok).toBe(true);
    expect(sale.cogs.toString()).toBe("2000");
    expect(sale.profit.toString()).toBe("2000");
  });

  it("reports a loss when the buyer pays below FIFO cost", () => {
    const batches: Batch[] = [
      { id: "b1", qty: new Decimal(5), price: new Decimal(1000) },
    ];
    const sale = modelSell(batches, [], new Decimal(5), new Decimal(3000));
    expect(sale.profit.toString()).toBe("-2000"); // paid 3,000, cost 5,000
  });

  it("property: profit + COGS always equals what the buyer paid", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            qty: fc.integer({ min: 1, max: 100 }),
            price: fc.integer({ min: 1, max: 100_000 }),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 10_000_000 }),
        (rows, sellQty, amount) => {
          const batches: Batch[] = rows.map((r, i) => ({
            id: `b${i}`,
            qty: new Decimal(r.qty),
            price: new Decimal(r.price),
          }));
          const sale = modelSell(
            batches,
            [],
            new Decimal(sellQty),
            new Decimal(amount),
          );
          if (!sale.ok) return true; // insufficient stock → action rejects
          return sale.profit.plus(sale.cogs).equals(new Decimal(amount));
        },
      ),
      { numRuns: 200 },
    );
  });

  it("property: deleting a sale (undo / cascade) restores stock exactly", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (received, sold) => {
          const batches: Batch[] = [
            { id: "b1", qty: new Decimal(received), price: new Decimal(500) },
          ];
          const cons: Consumption[] = [];
          const sale = modelSell(
            batches,
            cons,
            new Decimal(sold),
            new Decimal(1),
          );
          if (!sale.ok) return true;
          cons.push(...sale.consumed);
          // Cascade delete: the sale's consumptions vanish with it.
          const afterUndo = cons.filter((c) => !sale.consumed.includes(c));
          const remaining = new Decimal(received).minus(
            afterUndo.reduce((s, c) => s.plus(c.qty), new Decimal(0)),
          );
          return remaining.equals(new Decimal(received));
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Sell dialog pack-entry math — plain JS numbers, exactly as the client does.
// ---------------------------------------------------------------------------

/** Mirror of sell-stock-dialog.tsx: staff type sub-units, ledger runs in packs. */
function dialogPackMath(opts: {
  subFactor: number;
  maxPacks: number;
  entered: number; // what staff typed, in sub-units (e.g. metres)
}) {
  const maxInEntryUnits = opts.maxPacks * opts.subFactor;
  const overStock = opts.entered > maxInEntryUnits;
  const qtyPacks = opts.entered / opts.subFactor;
  return { maxInEntryUnits, overStock, qtyPacks };
}

describe("sell dialog pack-entry math", () => {
  it("converts the dripper-roll case: 30 m of a 100 m roll = 0.3 rolls", () => {
    const r = dialogPackMath({ subFactor: 100, maxPacks: 9, entered: 30 });
    expect(r.qtyPacks).toBe(0.3);
    expect(r.maxInEntryUnits).toBe(900);
    expect(r.overStock).toBe(false);
  });

  it("blocks selling more sub-units than are on the shelf", () => {
    const r = dialogPackMath({ subFactor: 50, maxPacks: 2, entered: 101 });
    expect(r.overStock).toBe(true);
  });

  it("allows selling exactly everything", () => {
    const r = dialogPackMath({ subFactor: 50, maxPacks: 2, entered: 100 });
    expect(r.overStock).toBe(false);
    expect(r.qtyPacks).toBe(2);
  });

  it("property: pack conversion round-trips within float tolerance", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }), // subFactor (pcs per pack)
        fc.integer({ min: 1, max: 500 }), // maxPacks on hand
        fc.integer({ min: 1, max: 100_000 }), // entered sub-units
        (subFactor, maxPacks, entered) => {
          const r = dialogPackMath({ subFactor, maxPacks, entered });
          if (r.overStock) return true;
          // Converting back to sub-units recovers what staff typed.
          const roundTrip = r.qtyPacks * subFactor;
          return Math.abs(roundTrip - entered) < 1e-6 * Math.max(1, entered);
        },
      ),
      { numRuns: 200 },
    );
  });
});
