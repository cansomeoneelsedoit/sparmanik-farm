import { getLocale } from "next-intl/server";

import { formatMoney } from "@/server/money";
import { prisma } from "@/server/prisma";

export async function Money({
  value,
  convertToAUD = false,
}: {
  value: string | null | undefined;
  convertToAUD?: boolean;
}) {
  const locale = (await getLocale()) as "en" | "id";
  let exchangeRate: string | null = null;
  if (convertToAUD) {
    const setting = await prisma.setting.findFirst();
    exchangeRate = setting?.exchangeRate.toFixed(4) ?? null;
  }
  return <>{formatMoney(value ?? null, { locale, convertToAUD, exchangeRate })}</>;
}
