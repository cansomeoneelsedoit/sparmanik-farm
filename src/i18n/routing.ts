import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "id"],
  defaultLocale: "en",
  // No locale prefix in the URL; we read the locale from a cookie.
  localePrefix: "never",
});

export type Locale = (typeof routing.locales)[number];
