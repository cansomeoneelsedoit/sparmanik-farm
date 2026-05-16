import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { routing, type Locale } from "@/i18n/routing";

const LOCALE_COOKIE = "NEXT_LOCALE";

async function readLocaleFromCookie(): Promise<Locale> {
  const store = await cookies();
  const cookie = store.get(LOCALE_COOKIE);
  if (cookie && (routing.locales as readonly string[]).includes(cookie.value)) {
    return cookie.value as Locale;
  }
  return routing.defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await readLocaleFromCookie();
  const messages = (await import(`@/i18n/messages/${locale}.json`)).default;
  return { locale, messages };
});
