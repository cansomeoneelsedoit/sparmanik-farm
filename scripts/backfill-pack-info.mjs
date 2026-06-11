#!/usr/bin/env node
/**
 * Bulk pack-info backfill — parses pack sizes straight out of item names.
 *
 * Item names imported from Shopee literally state the pack size:
 *   "(25 KG) MKP Meroke …"        → 1 unit = 25 kg
 *   "1 Rol (100 Meter) - Selang…" → 1 unit = 100 metres
 *   "Benih … isi 500 biji"        → 1 unit = 500 seeds
 *   "Grommet … isi 10pcs"         → 1 unit = 10 pieces
 *
 * For every item with sub_factor still NULL, try the pattern ladder below
 * (most-specific measure first) and set sub_unit + sub_factor. The item's
 * `unit` (pack noun) is left untouched — "1 pcs = 25 kg" renders fine in
 * the dialogs, and renaming pack nouns is a cosmetic call the user can
 * make later.
 *
 * Ambiguity guards — SKIPPED, never guessed:
 *   - "100/500 Meter", "15/30m" (multiple size options in one listing)
 *   - names matching two different measure types where neither is clearly
 *     the pack size
 *
 * Usage:
 *   DRY=1 node scripts/backfill-pack-info.mjs   # preview only
 *   node scripts/backfill-pack-info.mjs         # apply
 */

import { PrismaClient } from "@prisma/client";

const DRY = process.env.DRY === "1";
const prisma = new PrismaClient();

/**
 * Pattern ladder. First hit wins. Each entry: regex with ONE capture
 * group for the number, plus the sub-unit label to record.
 * All applied case-insensitively against the raw name.
 */
const PATTERNS = [
  // Bracketed pack counts FIRST — "[25 pcs] Thinwall 500ml" is a pack of
  // 25 containers; the 500ml is each container's volume, not the pack.
  { re: /[\[(]\s*(\d{1,4})\s*pcs\s*[\])]/i, subUnit: "pieces" },
  // Length — metres. "(100 Meter)", "100 meter", "50m Gulungan"
  { re: /\(?\s*(\d{1,4}(?:[.,]\d+)?)\s*(?:meter|metre)s?\s*\)?/i, subUnit: "metres" },
  { re: /\b(\d{1,4})\s*m\b(?!m|l|g)/i, subUnit: "metres", needsWord: /rol|roll|gulung|selang|hose|pipa|kabel|cable/i },
  // Mass — kg then grams. "(25 KG)", "1kg", "35Kg" / "500 gr", "10 gram"
  { re: /\b(\d{1,4}(?:[.,]\d+)?)\s*kg\b/i, subUnit: "kg" },
  { re: /\b(\d{1,4}(?:[.,]\d+)?)\s*(?:gram|gr)\b/i, subUnit: "grams" },
  // Volume — ml then litres. "500ml" / "5 Liter", "1 Liter"
  { re: /\b(\d{1,4}(?:[.,]\d+)?)\s*ml\b/i, subUnit: "ml" },
  { re: /\b(\d{1,4}(?:[.,]\d+)?)\s*(?:liter|litre|ltr)\b/i, subUnit: "litres" },
  // Seeds. "isi 500 biji", "350 biji", "2250 butir", "isi 500 benih"
  { re: /isi\s*(\d{1,5})\s*(?:biji|butir|benih|seeds?)\b/i, subUnit: "seeds" },
  { re: /\b(\d{2,5})\s*(?:biji|butir)\b/i, subUnit: "seeds" },
  // Discrete counts. "500 pcs", "isi 10pcs", "isi 50 lembar", "100pcs",
  // "isi 50", "350 Lubang" (tray holes)
  { re: /\b(\d{1,4})\s*pcs\b/i, subUnit: "pieces" },
  { re: /isi\s*(\d{1,4})\s*(?:pcs|pc|lembar|pieces?)?\b/i, subUnit: "pieces" },
  { re: /\b(\d{1,4})\s*(?:lembar|sheets?)\b/i, subUnit: "pieces" },
  { re: /\b(\d{1,4})\s*lubang\b/i, subUnit: "holes" },
];

/** Names with N/M size-option lists can't be parsed safely. */
const AMBIGUOUS = /\d\s*\/\s*\d+\s*(?:meter|metre|m\b|kg|gram|gr\b|liter|ltr|pcs)/i;

/**
 * Equipment whose number is a CAPACITY or DIMENSION, not pack contents:
 * scales ("Timbangan 40kg" weighs UP TO 40 kg), water tanks ("Toren 2000
 * Liter" holds 2000 L), pumps, machines, and hydroponic SET kits ("SET
 * LENGKAP 2 METER" is 2 m long). Setting pack info on these would make
 * the install dialog offer to consume "litres of water tank".
 */
const EQUIPMENT =
  /timbangan|\bscale\b|toren|tandon|tangki|\btank\b|mesin|pompa|\bpump\b|aquaponik|hidroponik set|set lengkap|set premium|planter bag|grow light|growlight|lampu|sprayer/i;

function parsePack(name) {
  if (!name) return null;
  if (AMBIGUOUS.test(name)) return { skip: "ambiguous (multiple size options in name)" };
  if (EQUIPMENT.test(name)) return null; // capacity/dimension, not a pack
  for (const p of PATTERNS) {
    if (p.needsWord && !p.needsWord.test(name)) continue;
    const m = name.match(p.re);
    if (m) {
      const n = Number(String(m[1]).replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) continue;
      // A "pack of 1 piece" is meaningless — only keep factor 1 for
      // measures (1 kg / 1 litre still enables unit-based usage).
      if (n === 1 && (p.subUnit === "pieces" || p.subUnit === "seeds" || p.subUnit === "holes")) continue;
      return { subUnit: p.subUnit, factor: n, matched: m[0].trim() };
    }
  }
  return null;
}

async function main() {
  console.log(`=== Pack-info backfill ${DRY ? "(DRY RUN)" : "(LIVE)"} ===\n`);

  const items = await prisma.item.findMany({
    where: { subFactor: null },
    select: { id: true, code: true, name: true, unit: true },
    orderBy: { code: "asc" },
  });

  let set = 0;
  let skipped = 0;
  let noMatch = 0;

  for (const it of items) {
    const parsed = parsePack(it.name);
    if (!parsed) {
      noMatch++;
      continue;
    }
    if (parsed.skip) {
      console.log(`  SKIP ${it.code} — ${parsed.skip}\n       ${it.name.slice(0, 70)}`);
      skipped++;
      continue;
    }
    console.log(
      `  ${it.code}  1 ${it.unit} = ${parsed.factor} ${parsed.subUnit}` +
        `   (from "${parsed.matched}")\n       ${it.name.slice(0, 70)}`,
    );
    if (!DRY) {
      await prisma.item.update({
        where: { id: it.id },
        data: { subUnit: parsed.subUnit, subFactor: parsed.factor },
      });
    }
    set++;
  }

  console.log(
    `\n=== ${DRY ? "WOULD SET" : "SET"} pack info on ${set} items ===` +
      `\nSkipped (ambiguous): ${skipped}` +
      `\nNo size in name: ${noMatch}` +
      (DRY ? `\n\nRun without DRY=1 to apply.` : `\nDone.`),
  );
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
