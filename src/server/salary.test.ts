import { describe, expect, it } from "vitest";
import { salaryAccrual, salaryDays } from "./salary";

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("salaryAccrual", () => {
  it("charges a full calendar month exactly once", () => {
    const r = { monthlyAmount: 3_000_000, startDate: d("2026-08-01"), endDate: null };
    expect(salaryAccrual(r, null, d("2026-08-31")).toNumber()).toBe(3_000_000);
  });
  it("prorates by days in the month (Jul has 31)", () => {
    const r = { monthlyAmount: 3_000_000, startDate: d("2026-07-30"), endDate: null };
    // 30,31 Jul = 2/31 of a month
    expect(salaryAccrual(r, null, d("2026-07-31")).toNumber()).toBeCloseTo((3_000_000 * 2) / 31, 2);
  });
  it("spans months: 30 Jul → 19 Aug", () => {
    const r = { monthlyAmount: 3_000_000, startDate: d("2026-07-30"), endDate: null };
    const expected = (3_000_000 * 2) / 31 + (3_000_000 * 19) / 31; // Aug also 31 days
    expect(salaryAccrual(r, null, d("2026-08-19")).toNumber()).toBeCloseTo(expected, 2);
    expect(salaryDays(r, null, d("2026-08-19"))).toBe(21);
  });
  it("freezes at the harvest end and honours the assignment end", () => {
    const r = { monthlyAmount: 3_000_000, startDate: d("2026-08-01"), endDate: d("2026-08-10") };
    expect(salaryDays(r, d("2026-08-05"), d("2026-08-19"))).toBe(5);
    expect(salaryDays(r, null, d("2026-08-19"))).toBe(10);
  });
  it("is zero before start or for non-positive amounts", () => {
    const r = { monthlyAmount: 3_000_000, startDate: d("2026-09-01"), endDate: null };
    expect(salaryAccrual(r, null, d("2026-08-19")).toNumber()).toBe(0);
    expect(salaryAccrual({ ...r, monthlyAmount: 0, startDate: d("2026-08-01") }, null).toNumber()).toBe(0);
  });
});
