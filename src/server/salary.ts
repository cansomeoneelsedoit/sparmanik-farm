import { Decimal } from "@/server/decimal";

export type SalaryRow = {
  monthlyAmount: Decimal | string | number;
  startDate: Date;
  endDate: Date | null;
};

const dayUTC = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/**
 * Accrued fixed-salary cost for one assignment, day by day, INCLUSIVE of both
 * ends: each day charges monthly ÷ (days in that calendar month), so a full
 * month always sums to exactly the monthly figure regardless of length. The
 * window ends at the earliest of the assignment's endDate, the harvest end, or
 * `asOf` (today) — so it grows every day while the cycle is live and freezes
 * when the cycle closes.
 */
export function salaryAccrual(row: SalaryRow, harvestEnd: Date | null, asOf: Date = new Date()): Decimal {
  const monthly = new Decimal(row.monthlyAmount);
  if (monthly.lte(0)) return new Decimal(0);
  const start = dayUTC(row.startDate);
  const ends = [dayUTC(asOf)];
  if (row.endDate) ends.push(dayUTC(row.endDate));
  if (harvestEnd) ends.push(dayUTC(harvestEnd));
  const end = Math.min(...ends);
  if (end < start) return new Decimal(0);

  let total = new Decimal(0);
  // Walk month by month so a multi-month accrual is O(months), not O(days).
  let cursor = new Date(start);
  while (dayUTC(cursor) <= end) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth();
    const dim = daysInMonth(y, m);
    const monthEnd = Date.UTC(y, m, dim);
    const from = dayUTC(cursor);
    const to = Math.min(end, monthEnd);
    const days = Math.round((to - from) / 86_400_000) + 1;
    total = total.plus(monthly.times(days).div(dim));
    cursor = new Date(Date.UTC(y, m + 1, 1));
  }
  return total.toDecimalPlaces(4);
}

/** Days counted in the accrual window (for display). */
export function salaryDays(row: SalaryRow, harvestEnd: Date | null, asOf: Date = new Date()): number {
  const start = dayUTC(row.startDate);
  const ends = [dayUTC(asOf)];
  if (row.endDate) ends.push(dayUTC(row.endDate));
  if (harvestEnd) ends.push(dayUTC(harvestEnd));
  const end = Math.min(...ends);
  return end < start ? 0 : Math.round((end - start) / 86_400_000) + 1;
}
