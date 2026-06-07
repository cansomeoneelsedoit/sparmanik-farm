"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { ask } from "@/server/ai-chain";
import { extractJson } from "@/server/json-extract";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export type AiSuggestion = {
  itemId: string;
  /** Field the suggestion targets — "category" | "description" | "name" | "reusable". */
  field: string;
  /** Suggested value (always a string; booleans serialise as "true"/"false"). */
  value: string;
  /** One-line reasoning the AI offered. */
  reason: string;
};

/**
 * For each item id, ask the AI chain to draft the best value for the
 * target field. Returns one suggestion per item (drops anything the
 * model couldn't reason about so the UI never shows blank rows).
 *
 * The prompt is intentionally tight so the chain can use a cheap free
 * tier (Gemini Flash) without burning the Anthropic backstop.
 */
const requestSchema = z.object({
  checkId: z.string().min(1),
  field: z.enum(["category", "description", "name", "reusable"]),
  itemIds: z.array(z.string().min(1)).min(1).max(50),
});

export async function suggestFixes(input: unknown): Promise<ActionResult<{ suggestions: AiSuggestion[] }>> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { field, itemIds } = parsed.data;

  // Pull the affected items + the org's existing categories so the AI
  // suggests names that already exist (avoids fragmenting the category
  // list with near-duplicates like "Seed" vs "Seeds").
  const [items, categories] = await Promise.all([
    prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        reusable: true,
        category: { select: { name: true } },
      },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  type ItemLite = {
    id: string;
    code: string;
    name: string;
    description: string | null;
    reusable: boolean;
    category: { name: string } | null;
  };
  const knownCategories = (categories as { name: string }[]).map((c) => c.name);

  // Compose the field-specific prompt.
  let prompt: string;
  if (field === "category") {
    prompt = `You categorise hydroponic-farm inventory items.

Given the items below, suggest the most appropriate category for each. Prefer an EXISTING category from the list when reasonable; only invent a new one when no existing category fits. Use short, sentence-case names ("Seeds", "Nutrients", "Reusables"). Never return null.

Existing categories: ${knownCategories.length ? knownCategories.join(", ") : "(none yet)"}

Items:
${(items as ItemLite[]).map((it) => `- ${it.code} | ${it.name}${it.description ? ` — ${it.description.replace(/\s+/g, " ").slice(0, 160)}` : ""}`).join("\n")}

Reply with ONE JSON object, no markdown:
{ "suggestions": [ { "code": "SF00012", "category": "Seeds", "reason": "Name contains 'kirin seeds'" }, ... ] }`;
  } else if (field === "description") {
    prompt = `You write one-line product descriptions for hydroponic-farm inventory items.

For each item below, draft a single short sentence (≤ 18 words) describing what the item is, its purpose, and any obvious distinguishing detail (size, brand). No marketing fluff.

Items:
${(items as ItemLite[]).map((it) => `- ${it.code} | ${it.name} | ${it.category?.name ?? "Uncategorised"}`).join("\n")}

Reply with ONE JSON object, no markdown:
{ "suggestions": [ { "code": "SF00012", "description": "...", "reason": "Standard rockwool propagation cube." }, ... ] }`;
  } else if (field === "name") {
    prompt = `You rename inventory items that came in with empty / blank names.

Each item has a code and an optional description. Use the description to infer a concise product name (≤ 6 words, sentence-case). If you can't tell from the description, return "name": null.

Items:
${(items as ItemLite[]).map((it) => `- ${it.code} | (no name) | ${it.description?.slice(0, 200) ?? "(no description)"}`).join("\n")}

Reply with ONE JSON object, no markdown:
{ "suggestions": [ { "code": "SF00012", "name": "Rockwool cube 50mm", "reason": "Description mentions propagation cubes." }, ... ] }`;
  } else {
    // reusable
    prompt = `You decide whether a hydroponic-farm inventory item is REUSABLE (an asset that survives multiple harvests, depreciated across uses) or CONSUMABLE (used up on first use).

Examples:
- Rockwool, cocopeat, grow bags, drippers, frames, sensors, scissors, tanks, pumps → reusable
- Seeds, fertiliser, nutrient solution, pesticides, sprays → consumable

For each item, return true (reusable) or false (consumable).

Items (current flag in parentheses):
${(items as ItemLite[]).map((it) => `- ${it.code} | ${it.name} | currently=${it.reusable ? "reusable" : "consumable"}`).join("\n")}

Reply with ONE JSON object, no markdown:
{ "suggestions": [ { "code": "SF00012", "reusable": true, "reason": "Rockwool rolls last multiple harvests." }, ... ] }`;
  }

  let raw: string;
  try {
    raw = await ask({
      prompt,
      json: true,
      maxTokens: 1500,
      disableThinking: true,
      timeoutMs: 60_000,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed" };
  }
  type ModelOut = {
    suggestions?: Array<{
      code?: string;
      category?: string;
      description?: string;
      name?: string | null;
      reusable?: boolean;
      reason?: string;
    }>;
  };
  let modelOut: ModelOut;
  try {
    modelOut = extractJson<ModelOut>(raw);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "AI returned malformed JSON",
    };
  }
  const byCode = new Map((items as ItemLite[]).map((it) => [it.code, it]));
  const suggestions: AiSuggestion[] = [];
  for (const s of modelOut.suggestions ?? []) {
    if (!s.code) continue;
    const item = byCode.get(s.code);
    if (!item) continue;
    let value: string | null = null;
    if (field === "category" && typeof s.category === "string") value = s.category.trim();
    if (field === "description" && typeof s.description === "string") value = s.description.trim();
    if (field === "name" && typeof s.name === "string" && s.name.trim()) value = s.name.trim();
    if (field === "reusable" && typeof s.reusable === "boolean") value = String(s.reusable);
    if (!value) continue;
    suggestions.push({
      itemId: item.id,
      field,
      value,
      reason: typeof s.reason === "string" ? s.reason : "",
    });
  }
  return { ok: true, data: { suggestions } };
}

const applySchema = z.object({
  itemId: z.string().min(1),
  field: z.enum(["category", "description", "name", "reusable"]),
  value: z.string().min(1).max(2000),
});

export async function applyFix(input: unknown): Promise<ActionResult> {
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { itemId, field, value } = parsed.data;
  try {
    if (field === "category") {
      // Find or create the category (sentence-case-stable name match).
      const existing = await prisma.category.findFirst({
        where: { name: { equals: value, mode: "insensitive" } },
        select: { id: true },
      });
      const categoryId = existing
        ? existing.id
        : (await prisma.category.create({ data: { name: value } })).id;
      await prisma.item.update({ where: { id: itemId }, data: { categoryId } });
    } else if (field === "description") {
      await prisma.item.update({ where: { id: itemId }, data: { description: value } });
    } else if (field === "name") {
      await prisma.item.update({ where: { id: itemId }, data: { name: value } });
    } else if (field === "reusable") {
      await prisma.item.update({
        where: { id: itemId },
        data: { reusable: value === "true" },
      });
    }
    revalidatePath("/health-check");
    revalidatePath("/inventory");
    revalidatePath(`/inventory/${itemId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to apply" };
  }
}
