import { prisma } from "@/server/prisma";

/**
 * Progress helpers shared by the staff-facing training pages.
 *
 * "Passed" (for course progress AND module locking) means the user's LATEST
 * attempt at that module passed — retaking a module and failing re-locks the
 * ones after it, which keeps the signal honest for Boyd: the progress page
 * always reflects what the person can do NOW, not what they once managed.
 */

export type LatestAttempt = { passed: boolean; score: number };

/**
 * Latest attempt per module for one user. Simple findMany + overwrite-reduce —
 * attempts arrive ordered oldest→newest so the last write for each module id
 * wins. Fine at this scale (a course is tens of modules, not thousands).
 *
 * Pass `moduleIds` to restrict to one course's modules; omit it for the
 * all-courses overview. ModuleAttempt is org-scoped automatically by the
 * prisma extension. Attempts live on the MODULE (not the course-module join),
 * so passing a module once counts in every course that reuses it.
 */
export async function latestAttemptsByModule(
  userId: string,
  moduleIds?: string[],
): Promise<Map<string, LatestAttempt>> {
  if (!userId) return new Map();
  const attempts = (await prisma.moduleAttempt.findMany({
    where: { userId, ...(moduleIds ? { moduleId: { in: moduleIds } } : {}) },
    orderBy: { createdAt: "asc" },
    select: { moduleId: true, passed: true, score: true },
  })) as { moduleId: string; passed: boolean; score: number }[];
  const latest = new Map<string, LatestAttempt>();
  for (const a of attempts) latest.set(a.moduleId, { passed: a.passed, score: a.score });
  return latest;
}
