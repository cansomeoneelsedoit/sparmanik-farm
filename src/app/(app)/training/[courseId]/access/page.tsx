import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import type { EnrollmentRow } from "@/app/(app)/training/enrollment-actions";
import { AccessClient } from "@/app/(app)/training/[courseId]/access/access-client";

export const dynamic = "force-dynamic";

/**
 * Course access & pricing — superuser only (404 for everyone else, like the
 * course builder). Set the IDR price, see who's enrolled (and what they paid),
 * grant access by email, revoke access. Boyd records payments manually here
 * until a gateway is wired in.
 */
export default async function CourseAccessPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERUSER") notFound();

  const { courseId } = await params;

  const course = (await prisma.course.findFirst({
    where: { id: courseId },
    select: {
      id: true,
      titleEn: true,
      titleId: true,
      description: true,
      published: true,
      priceIdr: true,
    },
  })) as {
    id: string;
    titleEn: string;
    titleId: string;
    description: string | null;
    published: boolean;
    priceIdr: { toString(): string } | null;
  } | null;
  if (!course) notFound();

  // Same shape the listCourseEnrollments action returns — loaded here directly
  // so the table is server-rendered on first paint (the action exists for
  // client-side refreshes / other callers).
  const rows = (await prisma.courseEnrollment.findMany({
    where: { courseId },
    orderBy: { createdAt: "desc" },
    select: { id: true, userId: true, paidAmount: true, paidVia: true, note: true, createdAt: true },
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

  const enrollments: EnrollmentRow[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: byId.get(r.userId)?.name ?? null,
    userEmail: byId.get(r.userId)?.email ?? "(deleted user)",
    paidAmount: r.paidAmount ? r.paidAmount.toString() : null,
    paidVia: r.paidVia,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <AccessClient
      course={{
        id: course.id,
        titleEn: course.titleEn,
        titleId: course.titleId,
        description: course.description,
        priceIdr: course.priceIdr ? course.priceIdr.toString() : null,
      }}
      enrollments={enrollments}
    />
  );
}
