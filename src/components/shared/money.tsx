import { cache } from "react";
import { getLocale } from "next-intl/server";

import { formatMoney } from "@/server/money";
import { prisma } from "@/server/prisma";

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
}: {
  value: string | null | undefined;
  forceIDR?: boolean;
}) {
  const locale = (await getLocale()) as "en" | "id";
  const convertToAUD = !forceIDR && locale === "en";
  const exchangeRate = convertToAUD ? await getExchangeRate() : null;
  return <>{formatMoney(value ?? null, { locale, convertToAUD, exchangeRate })}</>;
}
