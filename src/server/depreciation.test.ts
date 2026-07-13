import { describe, expect, it } from "vitest";
import { Decimal } from "@/server/decimal";
import {
  amortisedCharge,
  cycleMonths,
  installDepreciation,
  type InstallChargeRow,
} from "@/server/depreciation";

const d = (n: string | number) => new Decimal(n);
// A fixed "now" so the tests never depend on the real clock.
const NOW = new Date("2026-07-12T00:00:00Z");
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("cycleMonths", () => {
  it("is ~1 month for a 30.4375-day span", () => {
    expect(Number(cycleMonths(day("2026-01-01"), day("2026-01-31")).toFixed(3))).toBeCloseTo(
      0.986,
      2,
    );
  });

  it("uses `now` when end is null", () => {
    // 2026-06-12 → 2026-07-12 is exactly 30 days.
    const m = cycleMonths(day("2026-06-12"), null, NOW);
    expect(Number(m.toFixed(4))).toBeCloseTo(30 / 30.4375, 3);
  });

  it("never goes negative when end precedes start", () => {
    expect(cycleMonths(day("2026-07-12"), day("2026-01-01")).toNumber()).toBe(0);
  });
});

describe("amortisedCharge", () => {
  it("PER_USE splits full cost across uses", () => {
    expect(amortisedCharge({ mode: "PER_USE", fullCost: d(100), uses: 4 })!.toString()).toBe("25");
  });

  it("PER_USE with no/zero uses falls back to a single use", () => {
    expect(amortisedCharge({ mode: "PER_USE", fullCost: d(100), uses: 0 })!.toString()).toBe("100");
  });

  it("CALENDAR is straight-line over life × cycle months", () => {
    // 240,000 over 24 months = 10,000/mo; 3 months → 30,000.
    const c = amortisedCharge({
      mode: "CALENDAR",
      fullCost: d(240_000),
      lifeMonths: 24,
      cycleMonths: d(3),
    });
    expect(c!.toString()).toBe("30000");
  });

  it("CALENDAR never charges more than the whole asset value", () => {
    const c = amortisedCharge({
      mode: "CALENDAR",
      fullCost: d(240_000),
      lifeMonths: 24,
      cycleMonths: d(100), // absurdly long — would be 1,000,000 uncapped
    });
    expect(c!.toString()).toBe("240000");
  });

  it("NONE returns null", () => {
    expect(amortisedCharge({ mode: "NONE", fullCost: d(100) })).toBeNull();
  });
});

describe("installDepreciation", () => {
  const perUse: InstallChargeRow = {
    depreciationMode: "PER_USE",
    amortisedCharge: d(25),
    acquisitionCost: d(100),
    usefulLifeMonths: null,
    date: day("2026-01-01"),
    returnedAt: null,
  };

  it("PER_USE returns the stored charge unchanged (time-independent)", () => {
    expect(installDepreciation(perUse, null, NOW).toString()).toBe("25");
  });

  // A TDS meter: 240,000 over 24 months, installed 3 months before "now".
  const calendarLive: InstallChargeRow = {
    depreciationMode: "CALENDAR",
    amortisedCharge: d(0), // frozen ~0 at install — must NOT be trusted
    acquisitionCost: d(240_000),
    usefulLifeMonths: 24,
    date: day("2026-04-12"),
    returnedAt: null,
  };

  it("CALENDAR live accrues over install→now, ignoring the frozen stored charge", () => {
    // 2026-04-12 → 2026-07-12 = 91 days ≈ 2.99 months → ~29,908.
    const charge = installDepreciation(calendarLive, null, NOW);
    expect(charge.toNumber()).toBeGreaterThan(29_000);
    expect(charge.toNumber()).toBeLessThan(31_000);
  });

  it("CALENDAR closed uses install→harvest end", () => {
    // Harvest closed at 2026-07-12; same window as above.
    const charge = installDepreciation(calendarLive, day("2026-07-12"), NOW);
    expect(charge.toNumber()).toBeGreaterThan(29_000);
    expect(charge.toNumber()).toBeLessThan(31_000);
  });

  it("CALENDAR damaged mid-cycle charges install→returnedAt, not 0 and not full", () => {
    const damaged: InstallChargeRow = {
      ...calendarLive,
      returnedAt: day("2026-05-12"), // 30 days in service
    };
    const charge = installDepreciation(damaged, null, NOW);
    // ~1 month of 10,000/mo ≈ 9,857 — the in-service accrual, residual excluded.
    expect(charge.toNumber()).toBeGreaterThan(9_000);
    expect(charge.toNumber()).toBeLessThan(10_500);
  });

  it("CALENDAR falls back to the stored charge when acquisitionCost is missing (legacy)", () => {
    const legacy: InstallChargeRow = {
      depreciationMode: "CALENDAR",
      amortisedCharge: d(5_000),
      acquisitionCost: null,
      usefulLifeMonths: 24,
      date: day("2026-04-12"),
      returnedAt: day("2026-07-12"),
    };
    // fullCost falls back to stored 5,000; 3mo/24mo × 5,000 ≈ 623.
    const charge = installDepreciation(legacy, null, NOW);
    expect(charge.toNumber()).toBeGreaterThan(500);
    expect(charge.toNumber()).toBeLessThan(700);
  });
});
