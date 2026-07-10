"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { requireSuperuser } from "@/server/authz";
import { recordAction } from "@/server/audit";
import { draftCourseFromYouTube } from "@/server/youtube-course";
import type { TransactionClient } from "@/server/decimal";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const schema = z.object({
  url: z
    .string()
    .url()
    .refine((u) => /youtube\.com|youtu\.be/.test(u), "Paste a YouTube link."),
});

/**
 * Build a whole DRAFT course from a YouTube video: Gemini watches the video,
 * structures it into lessons + bilingual questions, and everything is saved
 * unpublished for review in the builder. The video itself is added to the
 * Videos library (reused if the same URL already exists) and attached to
 * lesson 1 so staff watch it in the player.
 *
 * Slow by nature (the AI actually processes the video) — the dialog warns
 * that it can take a couple of minutes.
 */
export async function createCourseFromYouTube(
  input: unknown,
): Promise<ActionResult<{ courseId: string }>> {
  const gate = await requireSuperuser();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Paste a YouTube link." };
  }
  const userId = (await auth())?.user?.id ?? null;

  let draft;
  try {
    draft = await draftCourseFromYouTube(parsed.data.url);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the video" };
  }
  if (draft.lessons.length === 0) {
    return { ok: false, error: "The AI couldn't build lessons from this video — try a clearer teaching video." };
  }

  try {
    const courseId = await prisma.$transaction(async (tx: TransactionClient) => {
      // Reuse the Videos-library entry when this exact URL was added before.
      const existing = (await tx.video.findFirst({
        where: { url: parsed.data.url },
        select: { id: true },
      })) as { id: string } | null;
      const video =
        existing ??
        ((await tx.video.create({
          data: {
            titleEn: draft.titleEn,
            titleId: draft.titleId,
            type: "YOUTUBE",
            url: parsed.data.url,
            category: "Training",
          },
          select: { id: true },
        })) as { id: string });

      const course = (await tx.course.create({
        data: {
          titleEn: draft.titleEn,
          titleId: draft.titleId,
          description: draft.description,
          published: false,
        },
        select: { id: true },
      })) as { id: string };

      for (let li = 0; li < draft.lessons.length; li++) {
        const l = draft.lessons[li];
        const lesson = (await tx.lesson.create({
          data: {
            courseId: course.id,
            rank: li + 1,
            titleEn: l.titleEn,
            titleId: l.titleId,
            bodyEn: l.bodyEn || null,
            bodyId: l.bodyId || null,
            // The source video plays in lesson 1; later lessons carry the
            // segment summaries + questions (staff can scroll back anytime).
            videoId: li === 0 ? video.id : null,
          },
          select: { id: true },
        })) as { id: string };

        for (let qi = 0; qi < l.questions.length; qi++) {
          const q = l.questions[qi];
          await tx.question.create({
            data: {
              lessonId: lesson.id,
              rank: qi + 1,
              type: q.type,
              promptEn: q.promptEn,
              promptId: q.promptId,
              config: q.config,
            },
          });
        }
      }

      await recordAction(tx, {
        type: "training.youtube_course",
        entityType: "Course",
        entityId: course.id,
        description: `AI course from YouTube — ${draft.lessons.length} lessons`,
        userId,
        payload: { url: parsed.data.url, lessons: draft.lessons.length },
      });

      return course.id;
    }, {
      maxWait: 15_000,
      timeout: 60_000,
    });

    revalidatePath("/training");
    return { ok: true, data: { courseId } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save the course" };
  }
}
