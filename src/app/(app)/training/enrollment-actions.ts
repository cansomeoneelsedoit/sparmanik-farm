"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { recordAction } from "@/server/audit";
import { requireSuperuser } from "@/server/authz";
import type { TransactionClient } from "@/server/decimal";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/** One row of the access page's enrollment table. Decimal → string so it
 *  crosses the server/client boundary; format client-side. */
export type EnrollmentRow = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  paidAmount: string | null;
  paidVia: string | null;
  note: string | null;
  createdAt: string; // ISO
};

function revalidateCourseAccess(courseId: string) {
  revalidatePath("/training");
  revalidatePath(`/training/${courseId}`);
  revalidatePath(`/training/${courseId}/access`);
}

/** Enrollments for one course, newest first, with the learner's name/email
 *  resolved (CourseEnrollment carries a bare userId — no relation). */
export async function listCourseEnrollments(
  courseId: string,
): Promise<ActionResult<{ enrollments: EnrollmentRow[] }>> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const course = await prisma.course.findFirst({ where: { id: courseId }, select: { id: true } });
  if (!course) return { ok: false, error: "Course not found" };

  const rows = (await prisma.courseEnrollment.findMany({
    where: { courseId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      paidAmount: true,
      paidVia: true,
      note: true,
      createdAt: true,
    },
  })) as {
    id: string;
    userId: string;
    paidAmount: { toString(): string } | null;
    paidVia: string | null;
    note: string | null;
    createdAt: Date;
  }[];

  const users = (await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: { id: true, name: true, email: true },
  })) as { id: string; name: string | null; email: string }[];
  const byId = new Map(users.map((u) => [u.id, u]));

  return {
    ok: true,
    data: {
      enrollments: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: byId.get(r.userId)?.name ?? null,
        userEmail: byId.get(r.userId)?.email ?? "(deleted user)",
        paidAmount: r.paidAmount ? r.paidAmount.toString() : null,
        paidVia: r.paidVia,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
      })),
    },
  };
}

const grantSchema = z.object({
  courseId: z.string().min(1),
  email: z.string().email("Enter the learner's email"),
  /** Whole Rupiah actually paid, as a digit string; omit/null for free grants. */
  paidAmount: z
    .string()
    .trim()
    .regex(/^\d+$/, "Paid amount must be a whole number of Rupiah")
    .nullable()
    .optional(),
  paidVia: z.string().trim().max(100).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

/**
 * Record that a learner has access to a priced course — Boyd collects the
 * money however suits (cash/transfer) and writes it down here, or grants free
 * access. Upserts on (courseId, userId) so re-granting just updates the
 * payment details. The learner needs a login first (Admin → Users).
 */
export async function grantEnrollment(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const d = parsed.data;
  const course = (await prisma.course.findFirst({
    where: { id: d.courseId },
    select: { id: true, titleEn: true },
  })) as { id: string; titleEn: string } | null;
  if (!course) return { ok: false, error: "Course not found" };
  // User lookup is global (User isn't org-scoped) — the enrollment row itself
  // gets stamped with the active org by the prisma extension.
  const user = (await prisma.user.findUnique({
    where: { email: d.email.toLowerCase() },
    select: { id: true, email: true },
  })) as { id: string; email: string } | null;
  if (!user) {
    return { ok: false, error: "No user with that email — create their login in Admin → Users first." };
  }
  try {
    const enrollment = await prisma.$transaction(async (tx: TransactionClient) => {
      const e = await tx.courseEnrollment.upsert({
        where: { courseId_userId: { courseId: course.id, userId: user.id } },
        create: {
          courseId: course.id,
          userId: user.id,
          paidAmount: d.paidAmount ?? null,
          paidVia: d.paidVia || null,
          note: d.note || null,
        },
        update: {
          paidAmount: d.paidAmount ?? null,
          paidVia: d.paidVia || null,
          note: d.note || null,
        },
      });
      await recordAction(tx, {
        type: "training.enrollment.grant",
        entityType: "CourseEnrollment",
        entityId: e.id,
        description: `Enrolled ${user.email} in course "${course.titleEn}"`,
        userId: gate.userId,
        payload: {
          courseId: course.id,
          enrolledUserId: user.id,
          paidAmount: d.paidAmount ?? null,
          paidVia: d.paidVia || null,
        },
      });
      return e;
    });
    revalidateCourseAccess(course.id);
    return { ok: true, data: { id: enrollment.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save the enrollment" };
  }
}

/** Remove a learner's access (they keep their attempt history). */
export async function revokeEnrollment(id: string): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const existing = (await prisma.courseEnrollment.findFirst({
    where: { id },
    select: { id: true, courseId: true, userId: true },
  })) as { id: string; courseId: string; userId: string } | null;
  if (!existing) return { ok: false, error: "Enrollment not found" };
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.courseEnrollment.delete({ where: { id: existing.id } });
      await recordAction(tx, {
        type: "training.enrollment.revoke",
        entityType: "CourseEnrollment",
        entityId: existing.id,
        description: "Revoked a course enrollment",
        userId: gate.userId,
        payload: { courseId: existing.courseId, enrolledUserId: existing.userId },
      });
    });
    revalidateCourseAccess(existing.courseId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't revoke the enrollment" };
  }
}

/**
 * Does the SIGNED-IN user hold an enrollment row for this course? Pure
 * "am I enrolled" — free-course/superuser bypasses live in
 * isEnrolledOrFree (src/server/enrollment.ts), which the pages should use
 * to decide whether modules actually open.
 */
export async function myEnrollment(
  courseId: string,
): Promise<ActionResult<{ enrolled: boolean }>> {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return { ok: false, error: "Not signed in" };
  const enrollment = await prisma.courseEnrollment.findFirst({
    where: { courseId, userId: uid },
    select: { id: true },
  });
  return { ok: true, data: { enrolled: Boolean(enrollment) } };
}
