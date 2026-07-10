/**
 * Training marking core — pure functions, unit-tested. Marking happens ONLY on
 * the server: the player client receives questions via `sanitizeQuestion` (the
 * correct answers stripped from `config`) and submits raw answers; the score
 * comes back from `markAnswers`.
 *
 * Question config shapes (stored in Question.config, JSON):
 *   MULTIPLE_CHOICE / PHOTO_SPOT: { options: {en,id}[], correct: number[] }
 *   FILL_BLANK:                   { accept: string[] }   (accepted answers, any language)
 *   ORDER:                        { items: {en,id}[] }   (config order IS the correct order)
 *
 * Answer shapes (submitted by the player, JSON):
 *   MULTIPLE_CHOICE / PHOTO_SPOT: number[]  (selected option indexes)
 *   FILL_BLANK:                   string
 *   ORDER:                        number[]  (DISPLAYED positions, 0-based, in the
 *                                            user's chosen order. The client never
 *                                            learns original indexes — marking
 *                                            recomputes the deterministic shuffle
 *                                            server-side and maps positions back.
 *                                            Review finding: shipping original
 *                                            indexes as tags WAS the answer key.)
 */

export type LocalizedOption = { en: string; id: string };

export type QuestionForMarking = {
  id: string;
  type: "MULTIPLE_CHOICE" | "FILL_BLANK" | "ORDER" | "PHOTO_SPOT";
  config: unknown;
};

/** Normalize a fill-blank answer: trim, lower, collapse spaces, strip punctuation edges. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s.,!?;:'"()-]+|[\s.,!?;:'"()-]+$/g, "")
    .trim();
}

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

/** Mark ONE question. Unknown/malformed configs or answers mark as wrong (never throw). */
export function markQuestion(q: QuestionForMarking, answer: unknown): boolean {
  try {
    const cfg = q.config as Record<string, unknown>;
    if (q.type === "MULTIPLE_CHOICE" || q.type === "PHOTO_SPOT") {
      const correct = cfg.correct;
      if (!Array.isArray(correct) || !Array.isArray(answer)) return false;
      return sameSet(
        correct.filter((n): n is number => typeof n === "number"),
        (answer as unknown[]).filter((n): n is number => typeof n === "number"),
      );
    }
    if (q.type === "FILL_BLANK") {
      const accept = cfg.accept;
      if (!Array.isArray(accept) || typeof answer !== "string") return false;
      const given = norm(answer);
      if (given === "") return false;
      return accept.some((a) => typeof a === "string" && norm(a) === given);
    }
    if (q.type === "ORDER") {
      const items = cfg.items;
      if (!Array.isArray(items) || !Array.isArray(answer)) return false;
      const n = items.length;
      if (answer.length !== n) return false;
      const positions = answer as unknown[];
      if (!positions.every((v) => typeof v === "number" && v >= 0 && v < n)) return false;
      if (new Set(positions).size !== n) return false; // must be a permutation
      // The answer lists DISPLAYED positions in the user's chosen order.
      // Recompute the same deterministic shuffle the player saw and check the
      // user's arrangement reproduces the original config order.
      const map = orderShuffleMap(q.id, n); // map[displayedPos] = original idx
      return positions.every((pos, i) => map[pos as number] === i);
    }
    return false;
  } catch {
    return false;
  }
}

/** Mark a whole lesson attempt. `answers` is keyed by question id. */
export function markAnswers(
  questions: QuestionForMarking[],
  answers: Record<string, unknown>,
  passPct: number,
): { score: number; passed: boolean; perQuestion: Record<string, boolean> } {
  const perQuestion: Record<string, boolean> = {};
  let correct = 0;
  for (const q of questions) {
    const ok = markQuestion(q, answers[q.id]);
    perQuestion[q.id] = ok;
    if (ok) correct++;
  }
  const score = questions.length === 0 ? 0 : Math.round((correct / questions.length) * 100);
  return { score, passed: questions.length > 0 && score >= passPct, perQuestion };
}

/**
 * Deterministic shuffle map for an ORDER question: map[displayedPos] = original
 * config index. Seeded Fisher-Yates (mulberry32 on the question id) so a reload
 * shows the same arrangement, and NEVER the identity permutation (a review
 * finding showed the old sort-by-hash "shuffle" was monotonic in the index —
 * items always displayed in the correct answer order). Shared by
 * sanitizeQuestion (display) and markQuestion (mapping the submission back);
 * the client only ever sees shuffled items and submits display positions.
 */
export function orderShuffleMap(questionId: string, n: number): number[] {
  const map = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return map;
  const rand = mulberry32(hashCode(questionId));
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [map[i], map[j]] = [map[j], map[i]];
  }
  // Deterministic-identity guard: if the shuffle happens to be a no-op for this
  // id it would ALWAYS be a no-op — rotate by one so the displayed order never
  // equals the answer order.
  if (map.every((v, i) => v === i)) map.push(map.shift() as number);
  return map;
}

/**
 * Strip the correct answers out of a question's config before it goes to the
 * player client. ORDER items are SHUFFLED here via `orderShuffleMap` and sent
 * WITHOUT any reference to their original order — the client submits displayed
 * positions and the server re-derives the mapping when marking.
 */
export function sanitizeQuestion(q: {
  id: string;
  type: string;
  config: unknown;
}): { config: unknown } {
  const cfg = q.config as Record<string, unknown>;
  if (q.type === "MULTIPLE_CHOICE" || q.type === "PHOTO_SPOT") {
    return { config: { options: cfg.options ?? [] } };
  }
  if (q.type === "FILL_BLANK") {
    return { config: {} };
  }
  if (q.type === "ORDER") {
    const items = Array.isArray(cfg.items) ? (cfg.items as LocalizedOption[]) : [];
    const map = orderShuffleMap(q.id, items.length);
    return { config: { items: map.map((orig) => items[orig]) } };
  }
  return { config: {} };
}

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
