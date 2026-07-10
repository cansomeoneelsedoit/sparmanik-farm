/**
 * Display name for an inventory item under the active language. English UI
 * shows the AI-generated concise English name when present; Indonesian UI (and
 * anything customer/supplier-facing — receipts, shopping-list copy text, CSV
 * exports) always uses the original `name`. Pure module — safe to import from
 * both server and client components.
 */
export function localizedItemName(
  item: { name: string; nameEn?: string | null },
  locale: string,
): string {
  return locale === "en" && item.nameEn ? item.nameEn : item.name;
}
