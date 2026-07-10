import { prisma } from "@/server/prisma";
import { extractJson } from "@/server/json-extract";
import { coerceDraftQuestions, type DraftQuestion } from "@/server/quiz-draft";

/**
 * Draft a whole training course FROM A YOUTUBE VIDEO. Gemini ingests the video
 * URL directly (its API accepts YouTube links as file_data — no transcript
 * scraping), watches it, and returns a structured bilingual course: lessons in
 * teaching order, each with a summary of that segment and auto-markable
 * questions. Everything lands as a DRAFT for Boyd's review in the builder.
 *
 * Gemini-only (other providers can't watch video); walks the org's ranked
 * Gemini keys, then env keys, advancing on quota/errors — same spirit as
 * src/server/ai-chain.ts.
 */

export type CourseDraft = {
  titleEn: string;
  titleId: string;
  description: string | null;
  lessons: {
    titleEn: string;
    titleId: string;
    bodyEn: string;
    bodyId: string;
    questions: DraftQuestion[];
  }[];
};

type GeminiKey = { label: string; apiKey: string; model: string };

async function listGeminiKeys(): Promise<GeminiKey[]> {
  const keys: GeminiKey[] = [];
  const rows = (await prisma.aiProviderKey.findMany({
    where: { provider: "gemini", enabled: true },
    orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
    select: { label: true, apiKey: true, model: true },
  })) as { label: string | null; apiKey: string; model: string | null }[];
  for (const r of rows) {
    keys.push({ label: r.label ?? "db-gemini", apiKey: r.apiKey, model: r.model || "gemini-flash-latest" });
  }
  const e = process.env;
  for (const [label, key, model] of [
    ["env-gemini", e.GEMINI_API_KEY, e.GEMINI_MODEL],
    ["env-gemini-2", e.GEMINI_API_KEY_2, e.GEMINI_MODEL_2],
    ["env-gemini-3", e.GEMINI_API_KEY_3, e.GEMINI_MODEL_3],
  ] as const) {
    if (key) keys.push({ label, apiKey: key, model: model || "gemini-flash-latest" });
  }
  return keys;
}

const COURSE_PROMPT = `Watch this training video carefully. Turn it into a short course for Indonesian hydroponic-farm staff.

Structure the course as 2-8 LESSONS following the video's own teaching order (one lesson per major topic/segment — don't pad). For each lesson:
- a short title
- a body: 2-5 sentences summarising what that segment teaches, mentioning the rough timestamp range (e.g. "From the video (02:15-05:30): ...")
- 2-4 auto-markable questions strictly about that segment's content:
  * "MULTIPLE_CHOICE": 2-4 plausible options, 1-2 correct (correct = 0-based option indexes)
  * "FILL_BLANK": one short factual answer; 1-4 accepted spellings/synonyms (include both English and Indonesian forms)
  * "ORDER": 3-5 process steps in the CORRECT order (only where the segment teaches a sequence)

EVERYTHING must be written in BOTH English ("En"/"en") and natural Bahasa Indonesia ("Id"/"id").
Base everything strictly on what the video actually shows/says — do not invent facts.

Reply with ONLY JSON:
{"titleEn":"...","titleId":"...","description":"one-line course description in English",
 "lessons":[
  {"titleEn":"...","titleId":"...","bodyEn":"...","bodyId":"...",
   "questions":[
    {"type":"MULTIPLE_CHOICE","promptEn":"...","promptId":"...","options":[{"en":"...","id":"..."}],"correct":[0]},
    {"type":"FILL_BLANK","promptEn":"...","promptId":"...","accept":["...","..."]},
    {"type":"ORDER","promptEn":"...","promptId":"...","items":[{"en":"...","id":"..."}]}
   ]}
 ]}`;

async function callGeminiWithVideo(key: GeminiKey, youtubeUrl: string): Promise<string> {
  const ctrl = new AbortController();
  // Watching a video is slow — give it a generous window.
  const t = setTimeout(() => ctrl.abort(), 240_000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(key.model)}:generateContent?key=${encodeURIComponent(key.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { file_data: { file_uri: youtubeUrl } },
                { text: COURSE_PROMPT },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8000,
            responseMimeType: "application/json",
          },
        }),
        signal: ctrl.signal,
      },
    );
    if (!res.ok) {
      throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) throw new Error("Gemini returned an empty response");
    return text;
  } finally {
    clearTimeout(t);
  }
}

export async function draftCourseFromYouTube(youtubeUrl: string): Promise<CourseDraft> {
  const keys = await listGeminiKeys();
  if (keys.length === 0) {
    throw new Error("No Gemini key configured (Settings → AI keys) — Gemini is needed to watch YouTube videos.");
  }

  let lastError = "";
  for (const key of keys) {
    try {
      const raw = await callGeminiWithVideo(key, youtubeUrl);
      const draft = coerceCourse(extractJson<Record<string, unknown>>(raw));
      if (draft.lessons.length > 0) return draft;
      lastError = "The AI couldn't build lessons from this video.";
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Gemini call failed";
      // Try the next key on quota/temporary errors; give up early on a clearly
      // unusable video (unsupported/private) — those fail the same on every key.
      if (/private|unsupported|not.?found|invalid.*(uri|url)/i.test(lastError)) break;
    }
  }
  throw new Error(lastError || "Could not draft a course from this video.");
}

// ---- defensive coercion (same spirit as quiz-draft.ts) ---------------------

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function coerceCourse(parsed: Record<string, unknown>): CourseDraft {
  const lessons: CourseDraft["lessons"] = [];
  for (const l of Array.isArray(parsed.lessons) ? parsed.lessons : []) {
    const d = l as Record<string, unknown>;
    const titleEn = str(d.titleEn);
    const titleId = str(d.titleId);
    if (!titleEn || !titleId) continue;
    lessons.push({
      titleEn,
      titleId,
      bodyEn: str(d.bodyEn),
      bodyId: str(d.bodyId),
      // Shared coercion (quiz-draft.ts) — includes the correct-index remap fix.
      questions: coerceDraftQuestions(d.questions),
    });
  }
  return {
    titleEn: str(parsed.titleEn) || "Untitled course",
    titleId: str(parsed.titleId) || str(parsed.titleEn) || "Kursus tanpa judul",
    description: str(parsed.description) || null,
    lessons: lessons.slice(0, 8),
  };
}
