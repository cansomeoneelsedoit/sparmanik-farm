"use client";

import { useLocale } from "next-intl";

/**
 * Client-component twin of <LocalizedText>. Uses next-intl's `useLocale`
 * hook (works in client components) instead of `getLocale()` from
 * `next-intl/server` (which throws inside a "use client" tree).
 *
 * Import from this file when you need to render localized EN/ID text
 * inside a component marked `"use client"` (e.g. a search/filter UI
 * that needs interactivity).
 */
export function LocalizedTextClient({
  en,
  id,
}: {
  en: string | null | undefined;
  id: string | null | undefined;
}) {
  const locale = useLocale();
  if (locale === "id") return <>{id ?? en ?? ""}</>;
  return <>{en ?? id ?? ""}</>;
}
