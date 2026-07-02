import { cache } from "react";
import { getLocale } from "next-intl/server";

import { formatMoney } from "@/server/money";
import { prisma } from "@/server/prisma";
import { cn } from "@/lib/utils";

/**
 * Exchange rate for the current request, deduped with React cache(). Money
 * renders once per value on a page — a sales list has hundreds — and each was
 * firing its own identical Setting query (app review #18). cache() collapses
 * them to a single DB round-trip per request.
 */
const getExchangeRate = cache(async (): Promise<string | null> => {
  const setting = await prisma.setting.findFirst();
  return setting?.exchangeRate.toFixed(4) ?? null;
});

/**
 * Displays money. Default behaviour: render IDR when locale is "id", convert
 * to AUD when locale is "en". Pass `forceIDR` to always show rupiah.
 */
export async function Money({
  value,
  forceIDR = false,
  precise = false,
}: {
  value: string | null | undefined;
  forceIDR?: boolean;
  /** For per-unit rates (price/kg, cost/unit) so weight × rate ties out in AUD. */
  precise?: boolean;
}) {
  const locale = (await getLocale()) as "en" | "id";
  const convertToAUD = !forceIDR && locale === "en";
  const exchangeRate = convertToAUD ? await getExchangeRate() : null;
  return <>{formatMoney(value ?? null, { locale, convertToAUD, exchangeRate, precise })}</>;
}

/**
 * Dual-currency display for line-items on operational screens: Rupiah as the
 * primary figure (always clean and reconciles — it's the money that was
 * actually recorded) with a small AUD reference underneath. Rupiah prices don't
 * convert to round dollar figures, so showing AUD alone made rows look like they
 * didn't add up (app review — Boyd's choice: "Rp big, A$ small").
 *
 * The AUD line only appears when a rate is set. In ID locale it's still shown so
 * the owner keeps the AUD reference regardless of the app language.
 */
export async function MoneyDual({
  value,
  align = "end",
  className,
}: {
  value: string | null | undefined;
  /** Stacking alignment — "end" for right-aligned table cells (default), "start" for left-aligned stat cards. */
  align?: "start" | "end";
  className?: string;
}) {
  const locale = (await getLocale()) as "en" | "id";
  const idr = formatMoney(value ?? null, { locale, convertToAUD: false });
  const rate = await getExchangeRate();
  const aud = rate ? formatMoney(value ?? null, { locale, convertToAUD: true, exchangeRate: rate }) : null;
  return (
    <span
      className={cn(
        "inline-flex flex-col leading-tight",
        align === "start" ? "items-start" : "items-end",
        className,
      )}
    >
      <span>{idr}</span>
      {aud ? <span className="text-[10px] font-normal text-muted-foreground">{aud}</span> : null}
    </span>
  );
}
