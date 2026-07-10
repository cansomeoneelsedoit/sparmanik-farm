/**
 * Pure, dependency-free currency formatting — the SINGLE source of truth for how
 * rupiah and AUD render across the app. Imported by both the server components
 * (<Money>/<MoneyDual> in src/server/money.ts) and their client twin
 * (money-client.tsx). No Decimal / no server-only imports, so it is safe to pull
 * into a client bundle.
 *
 * Amounts are whole-rupiah (0 dp); AUD shows 2 dp, or up to 4 dp for per-unit
 * rates (`precise`) so weight × rate reconciles against the amount.
 */

export function formatIDR(amount: number, locale: "en" | "id" = "en"): string {
  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatAUD(amount: number, locale: "en" | "id" = "en", precise = false): string {
  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: precise ? 4 : 2,
  }).format(amount);
}
