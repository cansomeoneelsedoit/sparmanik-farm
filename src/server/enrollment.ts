import { prisma } from "@/server/prisma";

/**
 * Can this user open the MODULES of this course?
 *
 *  - free course (priceIdr null or 0) → everyone
 *  - SUPERUSER → always (they built the thing)
 *  - priced course → a CourseEnrollment row must exist (Boyd records the
 *    payment manually via /training/[courseId]/access, or grants free access)
 *
 * This is the single source of truth for the paywall: submitModuleAttempt
 * calls it server-side so the lock is real no matter what the UI shows, and
 * the course/player pages call it to decide what to render. Both queries are
 * org-scoped automatically by the prisma extension — a foreign-org courseId
 * resolves to no course and fails CLOSED.
 *
 * Deliberately a plain server module (not a "use server" action): it takes
 * `role` as an argument, so exposing it as a POST endpoint would let a client
 * pick their own role.
 */
export async function isEnrolledOrFree(
  courseId: string,
  userId: string,
  role: string | undefined,
): Promise<boolean> {
  if (role === "SUPERUSER") return true;
  const course = (await prisma.course.findFirst({
    where: { id: courseId },
    select: { priceIdr: true },
  })) as { priceIdr: { toString(): string } | null } | null;
  if (!course) return false;
  const price = course.priceIdr ? Number(course.priceIdr.toString()) : 0;
  if (!(price > 0)) return true;
  if (!userId) return false;
  const enrollment = await prisma.courseEnrollment.findFirst({
    where: { courseId, userId },
    select: { id: true },
  });
  return Boolean(enrollment);
}
