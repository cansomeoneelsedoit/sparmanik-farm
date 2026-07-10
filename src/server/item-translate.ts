import { ask } from "@/server/ai-chain";
import { extractJson } from "@/server/json-extract";

/**
 * AI-generate concise ENGLISH display names for inventory items. The stored
 * `name` is usually a verbatim Indonesian Shopee listing title ("【READY】
 * Timbangan Gantung Digital LCD 50KG Timbangan Elektronik Portabel …") — the
 * translation also CONDENSES: strip marketing noise, keep brand + size, cap
 * length, so the EN view reads like a normal stock list ("Digital hanging
 * scale 50 kg").
 */

const BATCH_SIZE = 25;
export { BATCH_SIZE as TRANSLATE_BATCH_SIZE };

type Row = { id: string; name: string };

/**
 * Translate one batch of item names. Returns a map of id → English name;
 * items the model skipped or returned empty/garbage for are simply absent
 * (they stay null and fall back to the original name in the UI).
 */
export async function translateItemNames(rows: Row[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (rows.length === 0) return out;

  const list = rows
    .map((r, i) => `${i + 1}. ${r.name.replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n");

  const prompt = `You are cleaning up an Indonesian hydroponic farm's inventory list.
For each numbered product name below (mostly Indonesian online-shop listing titles),
write a CONCISE ENGLISH display name:
- Translate Indonesian to English.
- Strip marketing noise: emojis, brackets like 【READY】, "ORIGINAL", "READY STOCK", seller names, duplicate phrasing.
- KEEP the brand (Netafim, Cultilene, Hanna…), the product type, and the size/capacity/spec.
- Maximum ~60 characters. Plain text, no quotes.
- If a name is already good English, return it unchanged (still condensed).

Items:
${list}

Reply with ONLY JSON: {"names": ["<english name for item 1>", "<english name for item 2>", ...]}
The array must have exactly ${rows.length} entries, in the same order.`;

  const raw = await ask({ prompt, json: true, maxTokens: 2500, disableThinking: true });
  const parsed = extractJson<{ names?: unknown }>(raw);
  const names = Array.isArray(parsed.names) ? parsed.names : [];

  for (let i = 0; i < rows.length; i++) {
    const v = names[i];
    if (typeof v !== "string") continue;
    const clean = v.replace(/\s+/g, " ").trim().slice(0, 120);
    // Defensive: skip empties and obvious echoes of the numbering.
    if (clean.length < 2 || /^\d+\./.test(clean)) continue;
    out.set(rows[i].id, clean);
  }
  return out;
}
