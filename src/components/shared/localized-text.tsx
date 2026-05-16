import { getLocale } from "next-intl/server";

/**
 * Picks the localized variant of a field stored as parallel EN/ID columns
 * (e.g. SOP.titleEn / SOP.titleId).
 */
export async function LocalizedText({ en, id }: { en: string | null | undefined; id: string | null | undefined }) {
  const locale = await getLocale();
  if (locale === "id") return <>{id ?? en ?? ""}</>;
  return <>{en ?? id ?? ""}</>;
}

export function pickLocalized<T extends { en?: string | null; id?: string | null }>(
  field: T,
  locale: "en" | "id",
): string {
  if (locale === "id") return field.id ?? field.en ?? "";
  return field.en ?? field.id ?? "";
}
