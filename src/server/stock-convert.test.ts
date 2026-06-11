import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Decimal } from "@/server/decimal";
import {
  batchRemaining,
  rescaleBatchToSubUnits,
  rescaleConsumptionToSubUnits,
} from "@/server/stock-convert";

/**
 * Tests for the Combine feature's money math (25 kg bag + 1 kg bag → one
 * kg-denominated item). Two real bugs hid here before these tests existed:
 *
 *   1. Source usages were re-pointed to the target BEFORE the target's
 *      usages were converted, so the freshly-moved rows got multiplied a
 *      second time (3 kg ballooned to 75 kg on a 25 kg/pack target).
 *   2. Batch consumptions were never rescaled with their batch, so a
 *      fully-consumed batch showed phantom remaining stock after combine.
 *
 * The orchestration model below mirrors the fixed order in combineItems
 * (target converts in place first, then source converts + moves) and uses
 * the REAL rescale functions, so a regression in either breaks loudly.
 */

const close = (a: Decimal, b: Decimal) =>
  a.minus(b).abs().lte(Decimal.max(a.abs(), b.abs(), 1).times("1e-10"));

describe("rescaleBatchToSubUnits", () => {
  it("converts the Calnit case: 2 × 25 kg bags @ Rp 250,000/bag", () => {
    const out = rescaleBatchToSubUnits(
      {
        qty: new Decimal(2),
        price: new Decimal(250_000),
        amortisedCostPerUse: null,
      },
      new Decimal(25),
    );
    expect(out.qty.toString()).toBe("50"); // 50 kg on the shelf
    expect(out.price.toString()).toBe("10000"); // Rp 10,000 per kg
    expect(out.amortisedCostPerUse).toBeNull();
  });

  it("property: total purchase cost (qty × price) is invariant", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 5_000_000 }),
        fc.integer({ min: 1, max: 1000 }),
        (qty, price, factor) => {
          const before = new Decimal(qty).times(price);
          const out = rescaleBatchToSubUnits(
            {
              qty: new Decimal(qty),
              price: new Decimal(price),
              amortisedCostPerUse: null,
            },
            new Decimal(factor),
          );
          return close(before, out.qty.times(out.price));
        },
      ),
      { numRuns: 200 },
    );
  });

  it("rescales amortisedCostPerUse so per-use charges follow the new unit", () => {
    const out = rescaleBatchToSubUnits(
      {
        qty: new Decimal(1),
        price: new Decimal(100_000),
        amortisedCostPerUse: new Decimal(25_000),
      },
      new Decimal(100),
    );
    expect(out.amortisedCostPerUse?.toString()).toBe("250");
  });
});

describe("rescaleConsumptionToSubUnits", () => {
  it("property: cost of what was used (qty × unitCost) is invariant", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 5_000_000 }),
        fc.integer({ min: 1, max: 1000 }),
        (qty, unitCost, factor) => {
          const before = new Decimal(qty).times(unitCost);
          const out = rescaleConsumptionToSubUnits(
            { qty: new Decimal(qty), unitCost: new Decimal(unitCost) },
            new Decimal(factor),
          );
          return close(before, out.qty.times(out.unitCost));
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Combine orchestration model — mirrors the fixed combineItems transaction.
// ---------------------------------------------------------------------------

type MConsumption = { qty: Decimal; unitCost: Decimal };
type MBatch = { qty: Decimal; price: Decimal; consumptions: MConsumption[] };
type MItem = { factor: Decimal; batches: MBatch[]; usages: Decimal[] };

/** Convert one item's rows into sub-units using the real rescale functions. */
function convertItem(it: MItem): { batches: MBatch[]; usages: Decimal[] } {
  return {
    batches: it.batches.map((b) => {
      const rb = rescaleBatchToSubUnits(
        { qty: b.qty, price: b.price, amortisedCostPerUse: null },
        it.factor,
      );
      return {
        qty: rb.qty,
        price: rb.price,
        consumptions: b.consumptions.map((c) =>
          rescaleConsumptionToSubUnits(c, it.factor),
        ),
      };
    }),
    usages: it.usages.map((u) => u.times(it.factor)),
  };
}

/** The fixed order: target converts in place FIRST, then source moves in. */
function modelCombine(source: MItem, target: MItem) {
  const t = convertItem(target);
  const s = convertItem(source);
  return {
    batches: [...t.batches, ...s.batches],
    usages: [...t.usages, ...s.usages],
  };
}

function totalRemaining(batches: MBatch[]): Decimal {
  return batches.reduce(
    (s, b) => s.plus(batchRemaining(b.qty, b.consumptions)),
    new Decimal(0),
  );
}

const arbItem = (maxFactor: number) =>
  fc
    .record({
      factor: fc.integer({ min: 1, max: maxFactor }),
      batches: fc.array(
        fc.record({
          qty: fc.integer({ min: 1, max: 50 }),
          price: fc.integer({ min: 100, max: 1_000_000 }),
          consumedShare: fc.float({ min: 0, max: 1, noNaN: true }),
        }),
        { maxLength: 5 },
      ),
      usages: fc.array(fc.integer({ min: 1, max: 20 }), { maxLength: 4 }),
    })
    .map(({ factor, batches, usages }): MItem => {
      return {
        factor: new Decimal(factor),
        batches: batches.map((b) => {
          const qty = new Decimal(b.qty);
          // Consume a fraction of the batch (rounded to 4 dp like the DB).
          const consumedQty = qty.times(b.consumedShare.toFixed(4)).toDP(4);
          return {
            qty,
            price: new Decimal(b.price),
            consumptions: consumedQty.gt(0)
              ? [{ qty: consumedQty, unitCost: new Decimal(b.price) }]
              : [],
          };
        }),
        usages: usages.map((u) => new Decimal(u)),
      };
    });

describe("combine orchestration model", () => {
  it("regression: a moved source usage is converted ONCE, not twice", () => {
    // Boyd's case: 1 kg bags (factor 1) merged into 25 kg bags (factor 25).
    const source: MItem = {
      factor: new Decimal(1),
      batches: [],
      usages: [new Decimal(3)], // 3 × 1 kg bags used on a greenhouse
    };
    const target: MItem = {
      factor: new Decimal(25),
      batches: [],
      usages: [new Decimal(2)], // 2 × 25 kg bags used
    };
    const out = modelCombine(source, target);
    const usageStrings = out.usages.map((u) => u.toString()).sort();
    // Target's 2 packs → 50 kg. Source's 3 packs → 3 kg — NOT 75 kg.
    expect(usageStrings).toEqual(["3", "50"]);
  });

  it("regression: a fully-consumed batch stays fully consumed (no phantom stock)", () => {
    const source: MItem = {
      factor: new Decimal(25),
      batches: [
        {
          qty: new Decimal(10), // 10 bags received...
          price: new Decimal(250_000),
          consumptions: [
            { qty: new Decimal(10), unitCost: new Decimal(250_000) }, // ...all used
          ],
        },
      ],
      usages: [],
    };
    const target: MItem = { factor: new Decimal(1), batches: [], usages: [] };
    const out = modelCombine(source, target);
    expect(totalRemaining(out.batches).toString()).toBe("0");
  });

  it("property: total remaining stock = source remaining × sFactor + target remaining × tFactor", () => {
    fc.assert(
      fc.property(arbItem(100), arbItem(100), (source, target) => {
        const expected = totalRemaining(source.batches)
          .times(source.factor)
          .plus(totalRemaining(target.batches).times(target.factor));
        const out = modelCombine(source, target);
        return close(totalRemaining(out.batches), expected);
      }),
      { numRuns: 150 },
    );
  });

  it("property: combining moves quantities, never money", () => {
    fc.assert(
      fc.property(arbItem(100), arbItem(100), (source, target) => {
        const cost = (batches: MBatch[]) =>
          batches.reduce((s, b) => s.plus(b.qty.times(b.price)), new Decimal(0));
        const before = cost(source.batches).plus(cost(target.batches));
        const out = modelCombine(source, target);
        return close(cost(out.batches), before);
      }),
      { numRuns: 150 },
    );
  });

  it("property: every usage scales by exactly its owner's factor", () => {
    fc.assert(
      fc.property(arbItem(100), arbItem(100), (source, target) => {
        const out = modelCombine(source, target);
        const expected = [
          ...target.usages.map((u) => u.times(target.factor)),
          ...source.usages.map((u) => u.times(source.factor)),
        ];
        return (
          out.usages.length === expected.length &&
          out.usages.every((u, i) => u.equals(expected[i]))
        );
      }),
      { numRuns: 150 },
    );
  });
});
