/**
 * Deterministic cover art for training courses/modules — no uploads, no
 * external images (the repo is public and the app is self-contained). Each id
 * hashes to a curated gradient + accent so every course card/hero looks
 * designed and KEEPS its look between renders.
 */

export type CoverArt = {
  /** CSS background-image value (layered gradients). */
  background: string;
  /** A readable accent from the same family (chips/rings on the cover). */
  accent: string;
};

// Curated pairs — farm-adjacent, high-contrast-safe under white text.
const PALETTES: { from: string; via: string; to: string; accent: string }[] = [
  { from: "#065f46", via: "#059669", to: "#34d399", accent: "#a7f3d0" }, // emerald
  { from: "#1e3a8a", via: "#2563eb", to: "#60a5fa", accent: "#bfdbfe" }, // blue
  { from: "#7c2d12", via: "#ea580c", to: "#fb923c", accent: "#fed7aa" }, // orange
  { from: "#4c1d95", via: "#7c3aed", to: "#a78bfa", accent: "#ddd6fe" }, // violet
  { from: "#134e4a", via: "#0d9488", to: "#2dd4bf", accent: "#99f6e4" }, // teal
  { from: "#831843", via: "#db2777", to: "#f472b6", accent: "#fbcfe8" }, // pink
  { from: "#713f12", via: "#ca8a04", to: "#facc15", accent: "#fef08a" }, // amber
  { from: "#312e81", via: "#4f46e5", to: "#818cf8", accent: "#c7d2fe" }, // indigo
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function coverArtFor(id: string): CoverArt {
  const p = PALETTES[hash(id) % PALETTES.length];
  // Angle + highlight position also derive from the id so covers in a grid
  // don't all sweep the same way.
  const angle = 115 + (hash(`${id}:a`) % 50);
  const spotX = 15 + (hash(`${id}:x`) % 70);
  return {
    background: [
      `radial-gradient(ellipse 80% 60% at ${spotX}% 0%, ${p.via}66, transparent)`,
      `linear-gradient(${angle}deg, ${p.from} 0%, ${p.via} 55%, ${p.to} 100%)`,
    ].join(", "),
    accent: p.accent,
  };
}
