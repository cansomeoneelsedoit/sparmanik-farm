/**
 * Variety → display colours, shared by the layout map and the tags overview so
 * a variety always looks the same everywhere. White Kirin is drawn hollow with
 * a red outline, exactly like Boyd's printed legend.
 */
export type VarietyStyle = { fill: string; border: string; hollow?: boolean };

export const VARIETY_STYLE: Record<string, VarietyStyle> = {
  "Yellow Kirin Kevin": { fill: "#f7d514", border: "#b89b00" },
  "White Kirin Kevin": { fill: "#ffffff", border: "#e02424", hollow: true },
  "Sparmanik Manis Candy": { fill: "#f97316", border: "#b45309" },
  "Yellow Kirin Australia F3": { fill: "#2563eb", border: "#1e40af" },
};

const FALLBACK: VarietyStyle[] = [
  { fill: "#10b981", border: "#047857" },
  { fill: "#8b5cf6", border: "#6d28d9" },
  { fill: "#ec4899", border: "#be185d" },
];

/** Stable style for a variety name; unknown names cycle the fallback palette
 *  by their position in `order`. */
export function varietyStyle(name: string | undefined, order: string[]): VarietyStyle {
  if (name && VARIETY_STYLE[name]) return VARIETY_STYLE[name];
  const i = Math.max(0, order.indexOf(name ?? "—"));
  return FALLBACK[i % FALLBACK.length];
}
