"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { requireSuperuser } from "@/server/authz";
import { recordAction } from "@/server/audit";
import { draftCourseFromYouTube } from "@/server/youtube-course";
import { setJobProgress } from "@/server/job-progress";
import type { TransactionClient } from "@/server/decimal";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const schema = z.object({
  url: z
    .string()
    .url()
    .refine((u) => /youtube\.com|youtu\.be/.test(u), "Paste a YouTube link."),
  /** Client-generated id for the live progress bar (see job-progress.ts). */
  jobId: z.string().min(8).max(64).optional(),
});

/**
 * Build a whole DRAFT course from a YouTube video: Gemini watches the video,
 * structures it into modules + bilingual questions, and everything is saved
 * unpublished for review in the builder. Each module is created in the
 * library and joined to the course in order (CourseModule rank 1..n). The
 * video itself is added to the Videos library (reused if the same URL already
 * exists) and attached to module 1 so staff watch it in the player.
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
  const jobId = parsed.data.jobId ?? "";

  // Real stages for the live status bar — the AI watching the video is the
  // long part (minutes); saving then ticks per module.
  setJobProgress(jobId, { stage: "watching", pct: 12 });
  let draft;
  try {
    draft = await draftCourseFromYouTube(parsed.data.url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not read the video";
    setJobProgress(jobId, { stage: "error", pct: 100, done: true, error: msg });
    return { ok: false, error: msg };
  }
  if (draft.lessons.length === 0) {
    const msg = "The AI couldn't build modules from this video — try a clearer teaching video.";
    setJobProgress(jobId, { stage: "error", pct: 100, done: true, error: msg });
    return { ok: false, error: msg };
  }
  setJobProgress(jobId, { stage: "saving", pct: 72, detail: `0/${draft.lessons.length}` });

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

      for (let mi = 0; mi < draft.lessons.length; mi++) {
        const l = draft.lessons[mi];
        const mod = (await tx.module.create({
          data: {
            titleEn: l.titleEn,
            titleId: l.titleId,
            bodyEn: l.bodyEn || null,
            bodyId: l.bodyId || null,
            // The source video plays in module 1; later modules carry the
            // segment summaries + questions (staff can scroll back anytime).
            videoId: mi === 0 ? video.id : null,
          },
          select: { id: true },
        })) as { id: string };

        await tx.courseModule.create({
          data: { courseId: course.id, moduleId: mod.id, rank: mi + 1 },
        });

        for (let qi = 0; qi < l.questions.length; qi++) {
          const q = l.questions[qi];
          await tx.question.create({
            data: {
              moduleId: mod.id,
              rank: qi + 1,
              type: q.type,
              promptEn: q.promptEn,
              promptId: q.promptId,
              config: q.config,
            },
          });
        }

        // Real per-module tick for the status bar (72 → 98%).
        setJobProgress(jobId, {
          stage: "saving",
          pct: 72 + Math.round(((mi + 1) / draft.lessons.length) * 26),
          detail: `${mi + 1}/${draft.lessons.length}`,
        });
      }

      await recordAction(tx, {
        type: "training.youtube_course",
        entityType: "Course",
        entityId: course.id,
        description: `AI course from YouTube — ${draft.lessons.length} modules`,
        userId,
        payload: { url: parsed.data.url, modules: draft.lessons.length },
      });

      return course.id;
    }, {
      maxWait: 15_000,
      timeout: 60_000,
    });

    revalidatePath("/training");
    revalidatePath("/training/modules");
    setJobProgress(jobId, { stage: "done", pct: 100, done: true });
    return { ok: true, data: { courseId } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save the course";
    setJobProgress(jobId, { stage: "error", pct: 100, done: true, error: msg });
    return { ok: false, error: msg };
  }
}
