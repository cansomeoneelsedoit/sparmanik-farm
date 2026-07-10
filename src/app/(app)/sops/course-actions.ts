"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { requireSuperuser } from "@/server/authz";
import { recordAction } from "@/server/audit";
import { draftQuiz } from "@/server/quiz-draft";
import { setJobProgress } from "@/server/job-progress";
import type { TransactionClient } from "@/server/decimal";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const schema = z.object({
  sopId: z.string().min(1),
  /** Client-generated id for the live progress bar. */
  jobId: z.string().min(8).max(64).optional(),
});

/**
 * Turn an SOP into a DRAFT training course: one module per SOP step (the
 * step's bilingual body becomes the teaching text) with 2-3 AI-drafted
 * questions each. Lands unpublished for review in the builder — the SOP
 * itself is untouched. Question drafting reports per-step progress to the
 * job store (a booklet-sized SOP takes a couple of minutes).
 */
export async function createCourseFromSop(
  input: unknown,
): Promise<ActionResult<{ courseId: string }>> {
  const gate = await requireSuperuser();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const jobId = parsed.data.jobId ?? "";

  const sop = (await prisma.sop.findFirst({
    where: { id: parsed.data.sopId },
    include: { steps: { orderBy: { position: "asc" } } },
  })) as
    | {
        id: string;
        titleEn: string;
        titleId: string;
        descriptionEn: string | null;
        steps: { position: number; bodyEn: string; bodyId: string }[];
      }
    | null;
  if (!sop) return { ok: false, error: "SOP not found" };
  if (sop.steps.length === 0) return { ok: false, error: "This SOP has no steps yet." };

  // Draft questions per step OUTSIDE the DB transaction (slow AI calls).
  // A step whose drafting fails just becomes a content-only module.
  setJobProgress(jobId, { stage: "drafting", pct: 5, detail: `0/${sop.steps.length}` });
  const drafted: { bodyEn: string; bodyId: string; questions: Awaited<ReturnType<typeof draftQuiz>> }[] = [];
  for (let i = 0; i < sop.steps.length; i++) {
    const s = sop.steps[i];
    let questions: Awaited<ReturnType<typeof draftQuiz>> = [];
    try {
      questions = await draftQuiz({ material: `${s.bodyEn}\n\n${s.bodyId}`, count: 3 });
    } catch {
      /* content-only module */
    }
    drafted.push({ bodyEn: s.bodyEn, bodyId: s.bodyId, questions });
    setJobProgress(jobId, {
      stage: "drafting",
      pct: 5 + Math.round(((i + 1) / sop.steps.length) * 70),
      detail: `${i + 1}/${sop.steps.length}`,
    });
  }

  setJobProgress(jobId, { stage: "saving", pct: 78, detail: `0/${drafted.length}` });
  try {
    const courseId = await prisma.$transaction(async (tx: TransactionClient) => {
      const course = (await tx.course.create({
        data: {
          titleEn: sop.titleEn,
          titleId: sop.titleId,
          description: sop.descriptionEn,
          published: false,
        },
        select: { id: true },
      })) as { id: string };

      for (let i = 0; i < drafted.length; i++) {
        const d = drafted[i];
        const firstLineEn = d.bodyEn.split("\n")[0]?.slice(0, 120) || `Step ${i + 1}`;
        const firstLineId = d.bodyId.split("\n")[0]?.slice(0, 120) || `Tahap ${i + 1}`;
        const mod = (await tx.module.create({
          data: {
            titleEn: firstLineEn,
            titleId: firstLineId,
            bodyEn: d.bodyEn,
            bodyId: d.bodyId,
          },
          select: { id: true },
        })) as { id: string };
        await tx.courseModule.create({
          data: { courseId: course.id, moduleId: mod.id, rank: i + 1 },
        });
        for (let qi = 0; qi < d.questions.length; qi++) {
          const q = d.questions[qi];
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
        setJobProgress(jobId, {
          stage: "saving",
          pct: 78 + Math.round(((i + 1) / drafted.length) * 20),
          detail: `${i + 1}/${drafted.length}`,
        });
      }

      await recordAction(tx, {
        type: "training.sop_course",
        entityType: "Course",
        entityId: course.id,
        description: `Course from SOP "${sop.titleEn}" — ${drafted.length} modules`,
        userId: gate.userId,
        payload: { sopId: sop.id, modules: drafted.length },
      });
      return course.id;
    }, { maxWait: 15_000, timeout: 120_000 });

    revalidatePath("/training");
    revalidatePath("/training/modules");
    setJobProgress(jobId, { stage: "done", pct: 100, done: true });
    return { ok: true, data: { courseId } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to build the course";
    setJobProgress(jobId, { stage: "error", pct: 100, done: true, error: msg });
    return { ok: false, error: msg };
  }
}
