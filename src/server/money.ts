import { Decimal } from "@/server/decimal";

/** Serialize a Prisma.Decimal for safe transport across the RSC boundary. */
export function serializeMoney(value: Decimal | number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return new Decimal(value).toFixed(4);
  return value.toFixed(4);
}

/** Parse a string from form input / a server action back into a Decimal. */
export function parseMoney(value: string | number): Decimal {
  return new Decimal(value);
}

/**
 * Format a money string for display. Defaults to IDR (no decimals). When
 * `convertToAUD` is true, divides by the provided exchange rate and renders
 * with AUD currency formatting.
 */
export function formatMoney(
  value: string | null,
  options: {
    locale?: "en" | "id";
    convertToAUD?: boolean;
    exchangeRate?: string | null;
    /**
     * For per-unit RATES (e.g. price/kg). Rounding a rate to 2 cents means
     * weight × rate no longer equals the amount in AUD — the row looks like it
     * doesn't add up (it ties out exactly in whole-rupiah IDR). Rates render at
     * up to 4 dp so the multiplication reconciles; amounts stay at 2 dp.
     */
    precise?: boolean;
  } = {},
): string {
  if (value === null || value === undefined) return "—";
  const dec = new Decimal(value);
  const { locale = "en", convertToAUD = false, exchangeRate, precise = false } = options;

  if (convertToAUD && exchangeRate) {
    const rate = new Decimal(exchangeRate);
    if (rate.gt(0)) {
      const aud = dec.div(rate).toNumber();
      return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-AU", {
        style: "currency",
        currency: "AUD",
        minimumFractionDigits: 2,
        maximumFractionDigits: precise ? 4 : 2,
      }).format(aud);
    }
  }

  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(dec.toNumber());
}
