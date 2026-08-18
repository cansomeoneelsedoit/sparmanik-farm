/**
 * Turn a raw extracted PDF page into clean Markdown that reads like the printed
 * booklet: real headings, bullet lists, GFM tables for tabular data, tracked-out
 * words repaired ("S PARMAN IK" → "SPARMANIK"), and EVERY number/dose/timing
 * kept exactly. Runs through the AI chain (Nemotron first) — text-only, so it
 * works on every provider. Falls back to a light deterministic tidy-up if the
 * chain is unavailable, so a build never fails on formatting.
 */
import { ask } from "@/server/ai-chain";

const PROMPT = (lang: "en" | "id", raw: string) => `You are formatting ONE page of a hydroponic melon-growing SOP booklet that was extracted from a PDF. The extraction lost the layout: headings, bullets and table cells are jumbled and some words are letter-spaced.

Rewrite this page as clean, professional Markdown, in the SAME language as the source (${lang === "id" ? "Bahasa Indonesia" : "English"}). Rules:
- Keep EVERY number, unit, dose, EC/ppm/pH value, time, day (HST) and product name EXACTLY as written. Do not add, remove or "correct" any figure.
- Repair letter-spaced words (e.g. "S PARMAN IK FARM" → "SPARMANIK FARM", "N U TRITION" → "NUTRITION").
- Use one "## " heading for the page title, "### " for sub-sections, "-" bullets for lists, and a GFM table (| a | b |) wherever the text is clearly tabular (recipes, schedules, checklists with columns).
- Preserve step order. Keep short warnings/"Never do this" lists as bullets. Bold the key values (**EC 2.1**, **5 L**).
- No commentary, no preamble, no code fences — output ONLY the Markdown.

PAGE TEXT:
<<<
${raw}
>>>`;

/** Cheap fallback: repair spaced caps and make the first line a heading. */
export function tidyPageText(raw: string): string {
  const lines = raw.split("\n").map((l) => l.trim());
  const fixSpaced = (l: string) =>
    l
      .split(/\s{2,}/)
      .map((w) => (w.split(/\s+/).filter((t) => t.length === 1).length >= 3 ? w.replace(/\s+/g, "") : w))
      .join(" ");
  const out: string[] = [];
  lines.forEach((l, i) => {
    if (!l) return;
    const t = fixSpaced(l);
    out.push(i === 0 ? `## ${t}` : t);
  });
  return out.join("\n\n");
}

export async function formatSopPageMarkdown(raw: string, lang: "en" | "id"): Promise<string> {
  const text = raw.trim();
  if (text.length < 40) return tidyPageText(text);
  try {
    const md = await ask({ prompt: PROMPT(lang, text.slice(0, 12_000)), maxTokens: 3000, timeoutMs: 120_000, disableThinking: true });
    const cleaned = md.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/i, "").trim();
    // Sanity: the model must not have dropped most of the content.
    if (cleaned.length < text.length * 0.35) return tidyPageText(text);
    return cleaned;
  } catch {
    return tidyPageText(text);
  }
}

/** Format many pages with bounded concurrency (the chain endpoint is shared). */
export async function formatSopPages(
  pages: { en: string; id: string }[],
  concurrency = 4,
  onProgress?: (done: number, total: number) => void,
): Promise<{ en: string; id: string }[]> {
  const out: { en: string; id: string }[] = new Array(pages.length);
  let next = 0;
  let done = 0;
  const total = pages.length;
  async function worker() {
    while (next < pages.length) {
      const i = next++;
      const p = pages[i];
      const same = p.en === p.id;
      const en = await formatSopPageMarkdown(p.en, "en");
      const id = same ? en : await formatSopPageMarkdown(p.id, "id");
      out[i] = { en, id };
      done++;
      onProgress?.(done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pages.length) }, worker));
  return out;
}

// ---------------------------------------------------------------------------
// Background job: format every page of an SOP into Markdown, writing progress
// to Sop.formatDone/formatTotal so the page can show a progress bar. Uses the
// raw client (no request context) with explicit ids — never org-ambiguous
// because it only touches rows by primary key.
// ---------------------------------------------------------------------------
import { PrismaClient } from "@prisma/client";

const jobs = new Set<string>();

export async function formatSopInBackground(sopId: string): Promise<void> {
  if (jobs.has(sopId)) return; // already running for this SOP
  jobs.add(sopId);
  const db = new PrismaClient();
  try {
    const steps = await db.sopStep.findMany({
      where: { sopId },
      orderBy: { position: "asc" },
      select: { id: true, bodyEn: true, bodyId: true, rawEn: true, rawId: true },
    });
    await db.sop.update({ where: { id: sopId }, data: { formatDone: 0, formatTotal: steps.length } });
    let done = 0;
    let next = 0;
    async function worker() {
      while (next < steps.length) {
        const s = steps[next++];
        const rawEn = s.rawEn ?? s.bodyEn;
        const rawId = s.rawId ?? s.bodyId;
        const same = rawEn === rawId;
        const en = await formatSopPageMarkdown(rawEn, "en");
        const id = same ? en : await formatSopPageMarkdown(rawId, "id");
        await db.sopStep.update({ where: { id: s.id }, data: { bodyEn: en, bodyId: id, rawEn, rawId, formatted: true } });
        done++;
        await db.sop.update({ where: { id: sopId }, data: { formatDone: done } });
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, steps.length) }, worker));
  } catch (e) {
    console.error("[sop-format] background job failed", sopId, e);
  } finally {
    jobs.delete(sopId);
    await db.$disconnect().catch(() => {});
  }
}
