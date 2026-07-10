"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { recordAction } from "@/server/audit";
import { requireSuperuser } from "@/server/authz";
import type { InputJsonValue, TransactionClient } from "@/server/decimal";
import { extractScormPackage, removeScormPackage } from "@/server/scorm";
import { isEnrolledOrFree } from "@/server/enrollment";
import { latestAttemptsByModule } from "@/app/(app)/training/progress";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const MAX_SCORM_BYTES = 150 * 1024 * 1024; // 150 MB zip

/** Same fan-out as actions.ts: a module can sit in many courses, so after a
 *  SCORM change every course page using it must re-render. */
async function revalidateModuleCourses(moduleId: string) {
  const joins = (await prisma.courseModule.findMany({
    where: { moduleId },
    select: { courseId: true },
  })) as { courseId: string }[];
  revalidatePath("/training");
  revalidatePath("/training/modules");
  for (const j of joins) {
    revalidatePath(`/training/${j.courseId}`);
    revalidatePath(`/training/${j.courseId}/edit`);
  }
}

/**
 * Attach (or replace) a module's SCORM 1.2 package. Superuser only. The zip
 * is extracted to <UPLOAD_DIR>/scorm/<moduleId>/ (previous package wiped) and
 * Module.scormPath stores "<moduleId>|<launchHref>" — the dir IS the module
 * id, kept in the value so the player never has to re-derive it.
 */
export async function setModuleScorm(
  moduleId: string,
  formData: FormData,
): Promise<ActionResult<{ launchHref: string }>> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No file provided" };
  if (file.size > MAX_SCORM_BYTES) {
    return { ok: false, error: "SCORM package too large (max 150 MB)" };
  }
  const mod = (await prisma.module.findFirst({
    where: { id: moduleId },
    select: { id: true, titleEn: true },
  })) as { id: string; titleEn: string } | null;
  if (!mod) return { ok: false, error: "Module not found" };
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { launchHref, fileCount } = await extractScormPackage(moduleId, buffer);
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.module.update({
        where: { id: moduleId },
        data: { scormPath: `${moduleId}|${launchHref}` },
      });
      await recordAction(tx, {
        type: "training.module.scorm",
        entityType: "Module",
        entityId: moduleId,
        description: `Attached SCORM package to module "${mod.titleEn}"`,
        userId: gate.userId,
        payload: { launchHref, fileCount },
      });
    });
    await revalidateModuleCourses(moduleId);
    return { ok: true, data: { launchHref } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "SCORM upload failed" };
  }
}

/** Remove a module's SCORM package: delete the extracted dir + null the field. */
export async function clearModuleScorm(moduleId: string): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const mod = (await prisma.module.findFirst({
    where: { id: moduleId },
    select: { id: true, titleEn: true },
  })) as { id: string; titleEn: string } | null;
  if (!mod) return { ok: false, error: "Module not found" };
  try {
    await removeScormPackage(moduleId);
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.module.update({ where: { id: moduleId }, data: { scormPath: null } });
      await recordAction(tx, {
        type: "training.module.scorm",
        entityType: "Module",
        entityId: moduleId,
        description: `Removed SCORM package from module "${mod.titleEn}"`,
        userId: gate.userId,
      });
    });
    await revalidateModuleCourses(moduleId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't remove the SCORM package" };
  }
}

const scormCompletionSchema = z.object({
  courseId: z.string().min(1),
  moduleId: z.string().min(1),
  /** cmi.core.score.raw as reported by the SCO; many SCOs never set one. */
  score: z.number().optional().nullable(),
  /** Explicit pass signal from lesson_status ("completed"/"passed" pass even
   *  when the SCO reports no/low score; "failed" fails regardless). */
  passed: z.boolean().optional(),
  /** Raw cmi snapshot for audit/debugging. */
  raw: z.record(z.unknown()).optional(),
});

/**
 * Record a SCORM completion as a ModuleAttempt. ANY signed-in user — but it
 * enforces exactly the same course rules as submitModuleAttempt in actions.ts
 * (a server action is a plain POST endpoint, so the gate must live here):
 *   - the CourseModule join must exist (module actually in that course)
 *   - the course must be published (non-superusers)
 *   - within that course, every earlier-ranked module's LATEST attempt passed
 * Plus one extra: the module must actually BE a SCORM module (scormPath set)
 * — otherwise this laxer endpoint (score defaults to 100) could forge passes
 * on ordinary quiz modules.
 *
 * Score is clamped to 0–100 and defaults to 100 when the SCO sends none.
 * `passed` honours the explicit lesson_status signal when given, falling back
 * to score >= module.passPct.
 */
export async function recordScormCompletion(
  input: unknown,
): Promise<ActionResult<{ score: number; passed: boolean }>> {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return { ok: false, error: "Not signed in" };
  const isSuperuser = (session.user as { role?: string }).role === "SUPERUSER";
  const parsed = scormCompletionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const join = (await prisma.courseModule.findFirst({
    where: { courseId: parsed.data.courseId, moduleId: parsed.data.moduleId },
    select: {
      rank: true,
      course: { select: { id: true, published: true } },
      module: { select: { id: true, passPct: true, scormPath: true } },
    },
  })) as {
    rank: number;
    course: { id: string; published: boolean };
    module: { id: string; passPct: number; scormPath: string | null };
  } | null;
  if (!join) return { ok: false, error: "Module not found" };
  if (!join.module.scormPath) return { ok: false, error: "Module not found" };

  if (!isSuperuser) {
    if (!join.course.published) return { ok: false, error: "Module not found" };
    // Mirror of submitModuleAttempt's paid-course gate: a priced course only
    // accepts attempts from enrolled learners.
    const role = (session.user as { role?: string }).role;
    if (!(await isEnrolledOrFree(join.course.id, uid, role))) {
      return { ok: false, error: "Enroll in this course first." };
    }
    // Same lock the player page enforces: all earlier-ranked modules' LATEST
    // attempts (in the course being taken) must have passed.
    const earlier = (await prisma.courseModule.findMany({
      where: { courseId: join.course.id, rank: { lt: join.rank } },
      select: { moduleId: true },
    })) as { moduleId: string }[];
    if (earlier.length > 0) {
      const latest = await latestAttemptsByModule(uid, earlier.map((e) => e.moduleId));
      const allPassed = earlier.every((e) => latest.get(e.moduleId)?.passed);
      if (!allPassed) return { ok: false, error: "Finish the earlier modules first." };
    }
  }

  const rawScore = parsed.data.score;
  const score =
    rawScore === null || rawScore === undefined
      ? 100
      : Math.min(100, Math.max(0, Math.round(rawScore)));
  const passed = parsed.data.passed ?? score >= join.module.passPct;
  const answers: Record<string, unknown> = { scorm: true };
  if (parsed.data.raw) answers.raw = parsed.data.raw;

  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      const attempt = await tx.moduleAttempt.create({
        data: {
          moduleId: join.module.id,
          userId: uid,
          score,
          passed,
          answers: answers as InputJsonValue,
        },
      });
      await recordAction(tx, {
        type: "training.attempt",
        entityType: "ModuleAttempt",
        entityId: attempt.id,
        description: `SCORM module attempt ${score}%`,
        userId: uid,
        payload: {
          moduleId: join.module.id,
          courseId: join.course.id,
          score,
          passed,
          scorm: true,
        },
      });
    });
    revalidatePath("/training");
    revalidatePath("/training/modules");
    revalidatePath(`/training/${join.course.id}`);
    revalidatePath(`/training/${join.course.id}/edit`);
    return { ok: true, data: { score, passed } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save the attempt" };
  }
}
