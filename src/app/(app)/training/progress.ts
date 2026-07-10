import { prisma } from "@/server/prisma";

/**
 * Progress helpers shared by the staff-facing training pages.
 *
 * "Passed" (for course progress AND lesson locking) means the user's LATEST
 * attempt at that lesson passed — retaking a lesson and failing re-locks the
 * ones after it, which keeps the signal honest for Boyd: the progress page
 * always reflects what the person can do NOW, not what they once managed.
 */

export type LatestAttempt = { passed: boolean; score: number };

/**
 * Latest attempt per lesson for one user. Simple findMany + overwrite-reduce —
 * attempts arrive ordered oldest→newest so the last write for each lesson id
 * wins. Fine at this scale (a course is tens of lessons, not thousands).
 *
 * Pass `lessonIds` to restrict to one course's lessons; omit it for the
 * all-courses overview. LessonAttempt is org-scoped automatically by the
 * prisma extension.
 */
export async function latestAttemptsByLesson(
  userId: string,
  lessonIds?: string[],
): Promise<Map<string, LatestAttempt>> {
  if (!userId) return new Map();
  const attempts = (await prisma.lessonAttempt.findMany({
    where: { userId, ...(lessonIds ? { lessonId: { in: lessonIds } } : {}) },
    orderBy: { createdAt: "asc" },
    select: { lessonId: true, passed: true, score: true },
  })) as { lessonId: string; passed: boolean; score: number }[];
  const latest = new Map<string, LatestAttempt>();
  for (const a of attempts) latest.set(a.lessonId, { passed: a.passed, score: a.score });
  return latest;
}
