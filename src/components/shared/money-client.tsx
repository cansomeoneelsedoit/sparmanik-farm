"use client";

import { useLocale } from "next-intl";

import { formatIDR, formatAUD } from "@/lib/money-format";
import { cn } from "@/lib/utils";

/**
 * Client twin of the server <MoneyDual> (src/components/shared/money.tsx) for the
 * POS register, where the cart lives in client state and can't use the async
 * server component. Same behaviour: the PRIMARY figure follows the language
 * toggle (English → AUD on top, Indonesian → Rupiah on top) with the other
 * currency small underneath, so figures reconcile either way.
 *
 * The exchange rate is passed in (fetched once by the server page) rather than
 * queried per value.
 */
export function MoneyDualClient({
  value,
  exchangeRate,
  align = "end",
  className,
}: {
  /** Whole-rupiah amount as a string (or number). */
  value: string | number | null | undefined;
  /** IDR-per-AUD rate as a string; null → show rupiah only. */
  exchangeRate: string | null;
  align?: "start" | "end";
  className?: string;
}) {
  const locale = useLocale() as "en" | "id";
  if (value === null || value === undefined || value === "") {
    return <span className={className}>—</span>;
  }
  const amount = Number(value);
  const idr = formatIDR(amount, locale);
  const rate = exchangeRate ? Number(exchangeRate) : null;
  const aud = rate && rate > 0 ? formatAUD(amount / rate, locale) : null;

  // Primary follows the toggle; the other currency is the small reference line.
  const audPrimary = locale === "en" && !!aud;
  const primary = audPrimary ? aud : idr;
  const secondary = audPrimary ? idr : aud;

  return (
    <span
      className={cn(
        "inline-flex flex-col leading-tight",
        align === "start" ? "items-start" : "items-end",
        className,
      )}
    >
      <span>{primary}</span>
      {secondary ? (
        <span className="text-[10px] font-normal text-muted-foreground">{secondary}</span>
      ) : null}
    </span>
  );
}
