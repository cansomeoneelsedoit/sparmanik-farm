"use server";

import { z } from "zod";

import { requireSuperuser } from "@/server/authz";
import { draftQuiz, type DraftQuestion } from "@/server/quiz-draft";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const schema = z.object({
  material: z.string().min(30, "Paste at least a paragraph of material to quiz on."),
  count: z.number().int().min(2).max(10),
});

/**
 * AI-draft quiz questions from lesson material (superuser-only — spends AI
 * credits). Returns drafts for REVIEW in the builder; nothing is saved until
 * Boyd ticks the ones he wants and they go through the normal createQuestion
 * validation.
 */
export async function draftQuizAction(
  input: unknown,
): Promise<ActionResult<{ questions: DraftQuestion[] }>> {
  const gate = await requireSuperuser();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    const questions = await draftQuiz(parsed.data);
    if (questions.length === 0) {
      return { ok: false, error: "The AI couldn't draft usable questions from that material — try more detailed text." };
    }
    return { ok: true, data: { questions } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI drafting failed" };
  }
}
