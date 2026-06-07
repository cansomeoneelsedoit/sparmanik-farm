/**
 * Robust JSON extractor for LLM responses.
 *
 * Models are told to return ONE JSON object, but in practice they sometimes:
 * - Wrap it in ```json … ``` fences (Anthropic does this most often)
 * - Add a one-line "Here's the JSON:" preface (Gemini 2.5 with thinking on)
 * - Append a trailing "Let me know if you need…" comment
 * - Output multiple objects separated by newlines
 * - Forget the closing brace under maxTokens cut-off
 *
 * This helper walks four strategies in order, returning the first one that
 * parses. Throws when none of them produce a valid object.
 */
export function extractJson<T = unknown>(raw: string): T {
  if (!raw || typeof raw !== "string") {
    throw new Error("Empty AI response");
  }
  const text = raw.trim();

  // Strategy 1 — strict parse. Hot path when the model behaves.
  try {
    return JSON.parse(text) as T;
  } catch {
    // continue
  }

  // Strategy 2 — strip leading/trailing markdown fences. Handles
  // ```json
  // { … }
  // ```
  // including languages other than `json` and trailing whitespace.
  const fenced = text
    .replace(/^```(?:json|JSON)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  if (fenced !== text) {
    try {
      return JSON.parse(fenced) as T;
    } catch {
      // continue
    }
  }

  // Strategy 3 — grab the JSON object embedded in surrounding prose by
  // finding the first { and matching it to the last balanced }. This
  // tolerates: "Here is the result: { … }. Done!"
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // continue
    }
  }

  // Strategy 4 — pull the body of any embedded ```json fence even when
  // there's prose on both sides.
  const fenceMatch = text.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      // continue
    }
  }

  // No strategy worked — give the caller enough context to debug.
  const preview = text.slice(0, 200).replace(/\s+/g, " ");
  throw new Error(`Couldn't extract JSON from AI response (got: "${preview}…")`);
}
