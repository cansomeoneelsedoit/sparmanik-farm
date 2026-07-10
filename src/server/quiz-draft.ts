import { ask } from "@/server/ai-chain";
import { extractJson } from "@/server/json-extract";

/**
 * AI quiz drafting — given lesson source material (an SOP's text, a video's
 * title/description, or free text Boyd pastes), draft bilingual questions for
 * the Training builder. Boyd reviews/edits before saving; nothing is published
 * automatically.
 *
 * Output matches the builder's Question.config shapes exactly (see
 * src/server/training.ts) so drafts drop straight into createQuestion.
 */

export type DraftQuestion =
  | {
      type: "MULTIPLE_CHOICE";
      promptEn: string;
      promptId: string;
      config: { options: { en: string; id: string }[]; correct: number[] };
    }
  | {
      type: "FILL_BLANK";
      promptEn: string;
      promptId: string;
      config: { accept: string[] };
    }
  | {
      type: "ORDER";
      promptEn: string;
      promptId: string;
      config: { items: { en: string; id: string }[] };
    };

export async function draftQuiz(source: {
  /** The teaching material to quiz on (lesson body, SOP text, video summary…). */
  material: string;
  /** How many questions to draft (2–10). */
  count: number;
}): Promise<DraftQuestion[]> {
  const count = Math.max(2, Math.min(10, Math.round(source.count)));
  const material = source.material.replace(/\s+/g, " ").slice(0, 6000);

  const prompt = `You are writing a short training quiz for Indonesian hydroponic-farm staff.
Source material:
"""
${material}
"""

Write EXACTLY ${count} questions testing understanding of the material. Mix the types:
- "MULTIPLE_CHOICE": 2-4 plausible options, 1 or 2 correct (list correct option INDEXES, 0-based)
- "FILL_BLANK": one short factual answer; list 1-4 accepted spellings/synonyms (both English and Indonesian forms of the answer)
- "ORDER": 3-5 process steps in the CORRECT order

Every prompt, option, and item must be provided in BOTH English ("en") and natural Bahasa Indonesia ("id").
Base everything strictly on the material — do not invent facts.

Reply with ONLY JSON:
{"questions":[
 {"type":"MULTIPLE_CHOICE","promptEn":"...","promptId":"...","options":[{"en":"...","id":"..."}],"correct":[0]},
 {"type":"FILL_BLANK","promptEn":"...","promptId":"...","accept":["...","..."]},
 {"type":"ORDER","promptEn":"...","promptId":"...","items":[{"en":"...","id":"..."}]}
]}`;

  const raw = await ask({ prompt, json: true, maxTokens: 3500, disableThinking: true });
  const parsed = extractJson<{ questions?: unknown[] }>(raw);
  return coerceDraftQuestions(parsed.questions);
}

/**
 * Defensively coerce an AI question list into valid DraftQuestions. Shared by
 * the per-lesson drafter above and the YouTube course drafter.
 *
 * MULTIPLE_CHOICE nuance (review finding): dropping malformed options SHIFTS
 * the indexes, so `correct` must be REMAPPED through the filter — filtering
 * first and keeping the raw indexes silently stored a wrong answer key.
 */
export function coerceDraftQuestions(v: unknown): DraftQuestion[] {
  const out: DraftQuestion[] = [];
  for (const q of Array.isArray(v) ? v : []) {
    const d = q as Record<string, unknown>;
    const promptEn = str(d.promptEn);
    const promptId = str(d.promptId);
    if (!promptEn || !promptId) continue;

    if (d.type === "MULTIPLE_CHOICE") {
      // Keep original indexes through the filter so `correct` can be remapped.
      const raw = Array.isArray(d.options) ? (d.options as unknown[]) : [];
      const kept: { option: { en: string; id: string }; origIdx: number }[] = [];
      for (let i = 0; i < raw.length && kept.length < 8; i++) {
        const r = raw[i] as Record<string, unknown> | null;
        const en = str(r?.en);
        const id = str(r?.id);
        if (en !== "" && id !== "") kept.push({ option: { en, id }, origIdx: i });
      }
      const newIdxByOrig = new Map(kept.map((k, newIdx) => [k.origIdx, newIdx]));
      const correct = [
        ...new Set(
          (Array.isArray(d.correct) ? d.correct : [])
            .filter((n): n is number => typeof n === "number")
            .map((n) => newIdxByOrig.get(n))
            .filter((n): n is number => n !== undefined),
        ),
      ];
      const options = kept.map((k) => k.option);
      if (options.length >= 2 && correct.length >= 1) {
        out.push({ type: "MULTIPLE_CHOICE", promptEn, promptId, config: { options, correct } });
      }
    } else if (d.type === "FILL_BLANK") {
      const accept = Array.isArray(d.accept)
        ? d.accept.filter((s): s is string => typeof s === "string" && s.trim() !== "").slice(0, 10)
        : [];
      if (accept.length >= 1) out.push({ type: "FILL_BLANK", promptEn, promptId, config: { accept } });
    } else if (d.type === "ORDER") {
      // Dropping a malformed ORDER item would corrupt the sequence — skip the
      // whole question instead when any item is unusable.
      const rawItems = Array.isArray(d.items) ? (d.items as unknown[]) : [];
      const items = pairs(d.items);
      if (items.length === rawItems.length && items.length >= 2 && items.length <= 8) {
        out.push({ type: "ORDER", promptEn, promptId, config: { items } });
      }
    }
  }
  return out;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function pairs(v: unknown): { en: string; id: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((o) => {
      const r = o as Record<string, unknown>;
      return { en: str(r.en), id: str(r.id) };
    })
    .filter((o) => o.en !== "" && o.id !== "");
}
