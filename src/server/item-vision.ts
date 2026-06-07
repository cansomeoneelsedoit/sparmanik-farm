import sharp from "sharp";

import { prisma } from "@/server/prisma";
import { askVision } from "@/server/ai-chain";
import { extractJson } from "@/server/json-extract";

/**
 * Match shape returned from `identifyItem`. `confidence` is the model's
 * self-reported best-guess, 0–1; the UI uses it to colour the chip.
 */
export type ItemMatch = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  photoPath: string | null;
  confidence: number;
  reason: string;
  /** "ai" — surfaced by the AI; "keyword" — keyword fallback when AI was uncertain. */
  source: "ai" | "keyword";
};

export type IdentifyResult = {
  /** What the AI thought it was looking at. Surfaced to the user so they
   * can validate the interpretation even when no match was confident. */
  saw: string;
  /** Generic product keywords the AI extracted (e.g. "polybag", "40cm")
   * — used by the keyword fallback when the AI's own matches were weak. */
  keywords: string[];
  matches: ItemMatch[];
};

type CandidateItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: { name: string } | null;
};

const SYSTEM_PROMPT = `You're helping a hydroponic farm staff member identify an item they're holding up to the camera. The photo could be ANY of:

- The item itself (a roll of rockwool, a plastic bag, a sensor)
- The item's packaging or label
- A product listing photo from a supplier (Shopee, Tokopedia, the front of a box)
- A hand-drawn label or specification sheet

For ALL of these, your job is to find the matching item from the catalogue.

CRITICAL RULES:
1. ALWAYS return your best guesses, even at LOW confidence. Don't bail just because no exact name match exists. If the photo shows a "polybag" and the catalogue has "grow bag", "planting bag", or "black bag", THOSE ARE MATCHES — return them. Match by what the item DOES, not by literal name string.

2. Only return an empty matches array if the photo is genuinely NOT a farm-supply product (a person's face, a landscape, an unrelated screenshot).

3. Use the broadest reasonable category. A photo of "Polybag 40x40" might match every bag-like item in inventory, ordered by size match.

4. ALWAYS write what you actually saw in "saw" — even when no good match exists, this helps the user search manually.

5. ALWAYS extract 2-5 product keywords in "keywords" (e.g. ["polybag", "40cm", "planting bag", "black plastic"]) — the app uses these as a search fallback when your matches are weak.

Output format (CRITICAL):
- Your ENTIRE response MUST be a single JSON object.
- The first character MUST be \`{\` and the last character MUST be \`}\`.
- Do NOT add prose before or after. Do NOT use markdown code fences. Do NOT explain.
- Stick exactly to this shape:

{
  "saw": "Short description of what's in the photo (≤ 20 words)",
  "keywords": ["polybag", "40cm", "..."],
  "matches": [
    {
      "code": "SF00012",
      "confidence": 0.85,
      "reason": "Catalogue item name is 'Grow bag 40cm' — same product type and size"
    }
  ]
}

Confidence guide:
- ≥ 0.7: very confident it's the same item
- 0.4–0.7: same product category, plausible match
- 0.2–0.4: weak/maybe, return anyway so the user can verify
- < 0.2: don't return

NEVER invent a code. NEVER return a code that isn't in the catalogue.`;

/**
 * Take a photo + the org's full item catalogue, ask the AI vision chain
 * which items the photo most likely depicts. The catalogue is sent as a
 * text block (code + name + category + description), so the model can
 * reason about descriptions like "white propagation cubes 50x50" matching
 * an item literally named "Rockwool cubes 50mm".
 *
 * Returns a structured result with the AI's interpretation ("saw"),
 * extracted keywords (used for the local keyword-search fallback when
 * the AI is uncertain), and a ranked match list.
 */
export async function identifyItem(buffer: Buffer): Promise<IdentifyResult> {
  // Pull the catalogue first so we can fail fast on an empty org without
  // burning a vision call.
  const items = (await prisma.item.findMany({
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      category: { select: { name: true } },
    },
  })) as CandidateItem[];

  if (items.length === 0) {
    return { saw: "Catalogue is empty.", keywords: [], matches: [] };
  }

  // Resize before encoding — receipt OCR uses the same heuristic.
  const normalised = await sharp(buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  const data = normalised.toString("base64");

  const catalogueText = items
    .map((i) => {
      const cat = i.category?.name ?? "Uncategorised";
      const desc = i.description ? ` — ${i.description.replace(/\s+/g, " ").slice(0, 160)}` : "";
      return `${i.code} | ${i.name} | ${cat}${desc}`;
    })
    .join("\n");

  const prompt = `${SYSTEM_PROMPT}

Here is the full inventory catalogue (one item per line, format \`code | name | category | description\`):

${catalogueText}

Look at the user's photo. What are the closest matches? Reply with JSON only — no markdown.`;

  let text: string;
  try {
    text = await askVision({
      prompt,
      imageBase64: data,
      imageMediaType: "image/jpeg",
      json: true,
      maxTokens: 1500,
      timeoutMs: 90_000,
    });
  } catch (e) {
    // AI chain exhausted — return an empty result with the error so the
    // UI can fall back to manual search.
    return {
      saw: e instanceof Error ? `AI request failed: ${e.message}` : "AI request failed",
      keywords: [],
      matches: [],
    };
  }

  type ModelMatch = { code?: string; confidence?: number; reason?: string };
  type ModelOutput = {
    saw?: string;
    keywords?: string[];
    matches?: ModelMatch[];
  };
  let parsed: ModelOutput;
  try {
    parsed = extractJson<ModelOutput>(text);
  } catch (e) {
    // Surface enough context for the user to act on. The raw response is
    // included so they can at least eyeball what the AI saw.
    const preview = text.slice(0, 200).replace(/\s+/g, " ");
    return {
      saw: `AI returned an unparseable response (${e instanceof Error ? e.message : "parse error"}). Raw start: "${preview}…"`,
      keywords: [],
      matches: [],
    };
  }

  const saw =
    typeof parsed.saw === "string" && parsed.saw.trim().length
      ? parsed.saw.trim()
      : "AI didn't describe what it saw.";
  const keywords =
    Array.isArray(parsed.keywords) && parsed.keywords.length
      ? parsed.keywords
          .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
          .map((k) => k.trim().toLowerCase())
      : [];

  const itemByCode = new Map(items.map((i) => [i.code, i]));
  const aiMatches = (parsed.matches ?? [])
    .map((m): ItemMatch | null => {
      if (!m.code) return null;
      const found = itemByCode.get(m.code);
      if (!found) return null;
      const confidence =
        typeof m.confidence === "number" && Number.isFinite(m.confidence)
          ? Math.max(0, Math.min(1, m.confidence))
          : 0;
      return {
        id: found.id,
        code: found.code,
        name: found.name,
        category: found.category?.name ?? null,
        photoPath: null,
        confidence,
        reason: typeof m.reason === "string" ? m.reason : "",
        source: "ai",
      };
    })
    .filter((x): x is ItemMatch => x !== null);

  // Keyword fallback — when the AI returned weak (or no) matches, do a
  // local string search of the catalogue using the keywords the AI
  // extracted. That way "Polybag 40x40" surfaces every catalogue row
  // whose name/description mentions "polybag" or "40cm" even if the AI
  // didn't return them in `matches`.
  const aiHasStrongMatch = aiMatches.some((m) => m.confidence >= 0.4);
  const dedupe = new Set(aiMatches.map((m) => m.id));
  const keywordMatches: ItemMatch[] = [];
  if (!aiHasStrongMatch && keywords.length > 0) {
    for (const it of items) {
      if (dedupe.has(it.id)) continue;
      const hay = `${it.name} ${it.description ?? ""} ${it.category?.name ?? ""}`.toLowerCase();
      const hits = keywords.filter((k) => hay.includes(k));
      if (hits.length === 0) continue;
      // Score by share of keywords matched. 1 hit out of 3 → 0.33;
      // 3 hits out of 3 → 1.0. Cap at 0.6 so AI matches still win.
      const confidence = Math.min(0.6, hits.length / keywords.length);
      keywordMatches.push({
        id: it.id,
        code: it.code,
        name: it.name,
        category: it.category?.name ?? null,
        photoPath: null,
        confidence,
        reason: `Keyword hit: ${hits.join(", ")}`,
        source: "keyword",
      });
      dedupe.add(it.id);
    }
    keywordMatches.sort((a, b) => b.confidence - a.confidence);
  }

  // Sort AI matches by confidence desc, then append keyword fallbacks.
  // Total cap at 8 rows so the UI stays scannable.
  aiMatches.sort((a, b) => b.confidence - a.confidence);
  const matches = [...aiMatches, ...keywordMatches].slice(0, 8);

  // Backfill photoPath in one query so we don't N+1.
  if (matches.length > 0) {
    const photos = await prisma.item.findMany({
      where: { id: { in: matches.map((m) => m.id) } },
      select: { id: true, photoPath: true },
    });
    const photoMap = new Map(
      (photos as { id: string; photoPath: string | null }[]).map((p) => [p.id, p.photoPath]),
    );
    for (const m of matches) m.photoPath = photoMap.get(m.id) ?? null;
  }

  return { saw, keywords, matches };
}
