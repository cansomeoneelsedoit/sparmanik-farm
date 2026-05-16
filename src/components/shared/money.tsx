import { getLocale } from "next-intl/server";

import { formatMoney } from "@/server/money";
import { prisma } from "@/server/prisma";

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
  let exchangeRate: string | null = null;
  if (convertToAUD) {
    const setting = await prisma.setting.findFirst();
    exchangeRate = setting?.exchangeRate.toFixed(4) ?? null;
  }
  return <>{formatMoney(value ?? null, { locale, convertToAUD, exchangeRate })}</>;
}
