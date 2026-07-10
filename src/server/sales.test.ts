import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { Decimal } from "@/server/decimal";
import { distributeCartTotal } from "@/server/sales";

/**
 * The POS register can set a whole-basket custom total (haggled round number).
 * `distributeCartTotal` splits it across the lines pro-rata; these assert the
 * money always ties out exactly — the property a reconciled receipt depends on.
 */

const D = (n: number | string) => new Decimal(n);
const sum = (xs: (string | undefined)[]) => xs.reduce((s, x) => s + (x ? Number(x) : 0), 0);

describe("distributeCartTotal", () => {
  it("no target → no overrides, gross = natural total", () => {
    const r = distributeCartTotal([D(1000), D(2000)], null);
    expect(r.overrides).toEqual([undefined, undefined]);
    expect(r.gross.toFixed(0)).toBe("3000");
  });

  it("target equal to the natural total → no-op (lines keep their own amounts)", () => {
    const r = distributeCartTotal([D(1000), D(2000)], D(3000));
    expect(r.overrides).toEqual([undefined, undefined]);
    expect(r.gross.toFixed(0)).toBe("3000");
  });

  it("discount splits pro-rata and sums EXACTLY to the target", () => {
    // natural 3000 + 1000 = 4000, discounted to 3600 (10% off)
    const r = distributeCartTotal([D(3000), D(1000)], D(3600));
    expect(sum(r.overrides)).toBe(3600);
    expect(r.gross.toFixed(0)).toBe("3600");
    expect(Number(r.overrides[0])).toBe(2700);
    expect(Number(r.overrides[1])).toBe(900);
  });

  it("markup splits and sums EXACTLY to the target", () => {
    const r = distributeCartTotal([D(1000), D(1000)], D(2500));
    expect(sum(r.overrides)).toBe(2500);
  });

  it("last line absorbs the rounding remainder", () => {
    // three equal lines, target 1000 → 333 + 333 + 334
    const r = distributeCartTotal([D(1000), D(1000), D(1000)], D(1000));
    expect(sum(r.overrides)).toBe(1000);
    expect(r.overrides.map(Number)).toEqual([333, 333, 334]);
  });

  it("single line → the override equals the target", () => {
    const r = distributeCartTotal([D(5000)], D(4500));
    expect(r.overrides).toEqual(["4500"]);
  });

  it("negative target is ignored", () => {
    const r = distributeCartTotal([D(1000)], D(-5));
    expect(r.overrides).toEqual([undefined]);
  });

  it("fractional custom total is rounded to whole rupiah and still ties out", () => {
    // 3600.5 -> 3601; lines must sum to 3601 and gross must equal 3601 (no sub-rupiah).
    const r = distributeCartTotal([D(3000), D(1000)], D(3600.5));
    expect(r.gross.toFixed(0)).toBe("3601");
    expect(sum(r.overrides)).toBe(3601);
    // gross is stored whole-rupiah, so it reconciles with the line sum exactly.
    expect(Number(r.gross.toString())).toBe(sum(r.overrides));
  });

  it("fractional single-line total rounds and ties out", () => {
    const r = distributeCartTotal([D(5000)], D(4500.7));
    expect(r.gross.toFixed(0)).toBe("4501");
    expect(r.overrides).toEqual(["4501"]);
  });

  it("property: any target (incl. fractional) — gross is whole rupiah and lines sum to it", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 5_000_000 }), { minLength: 1, maxLength: 8 }),
        fc.oneof(
          fc.integer({ min: 0, max: 5_000_000 }),
          fc.double({ min: 0, max: 5_000_000, noNaN: true, noDefaultInfinity: true }),
        ),
        (naturals, target) => {
          const r = distributeCartTotal(naturals.map((n) => D(n)), D(target));
          const grossInt = Number(r.gross.toFixed(0));
          if (Number(r.gross.toString()) !== grossInt) return false; // gross is whole rupiah
          const applied = r.overrides.some((o) => o !== undefined);
          if (applied) {
            return sum(r.overrides) === grossInt && r.overrides.every((o) => o !== undefined && Number(o) >= 0);
          }
          return r.overrides.every((o) => o === undefined);
        },
      ),
    );
  });

  it("property: integer naturals + integer target always tie out, never negative", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 5_000_000 }), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 0, max: 5_000_000 }),
        (naturals, target) => {
          const nats = naturals.map((n) => D(n));
          const natTotal = naturals.reduce((s, n) => s + n, 0);
          const r = distributeCartTotal(nats, D(target));
          if (target === natTotal) {
            return r.overrides.every((o) => o === undefined);
          }
          const allNonNeg = r.overrides.every((o) => o !== undefined && Number(o) >= 0);
          return sum(r.overrides) === target && allNonNeg;
        },
      ),
    );
  });
});
