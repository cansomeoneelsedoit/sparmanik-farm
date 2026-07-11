import { notFound } from "next/navigation";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { latestAttemptsByModule } from "@/app/(app)/training/progress";
import { SYNTH_LOGIN_DOMAIN } from "@/server/student-portal";
import { AddStudentDialog } from "@/app/(app)/students/add-student-dialog";
import {
  StudentsClient,
  type CourseOption,
  type StudentRow,
} from "@/app/(app)/students/students-client";

export const dynamic = "force-dynamic";

// The prisma client extension types findMany results loosely (see the course
// access page's `as` casts), so pin the shapes we selected.
type StudentRecord = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
};
type CourseRecord = {
  id: string;
  titleEn: string;
  titleId: string;
  published: boolean;
  modules: { moduleId: string }[];
};
type EnrollmentRecord = { userId: string; courseId: string };

/**
 * Students admin — superuser only (404 for everyone else, like the course
 * builder and Users admin). Lists everyone with a PORTAL login, lets Boyd
 * onboard new students, hand out / reset logins, assign courses, and see how
 * far each student has got. A "student" is just a User with role PORTAL that's
 * fenced to the education portal.
 */
export default async function StudentsPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPERUSER") notFound();

  const [students, courses, enrollments]: [
    StudentRecord[],
    CourseRecord[],
    EnrollmentRecord[],
  ] = await Promise.all([
    prisma.user.findMany({
      where: { role: "PORTAL" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        mustChangePassword: true,
        createdAt: true,
      },
    }),
    prisma.course.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        titleEn: true,
        titleId: true,
        published: true,
        modules: { select: { moduleId: true } },
      },
    }),
    prisma.courseEnrollment.findMany({ select: { userId: true, courseId: true } }),
  ]);

  // Course → its module ids (a course is "complete" when every one has a
  // passing latest attempt).
  const courseModuleIds = new Map<string, string[]>(
    courses.map((c) => [c.id, c.modules.map((m) => m.moduleId)]),
  );

  // Student → assigned course ids.
  const assignedByStudent = new Map<string, string[]>();
  for (const e of enrollments) {
    const list = assignedByStudent.get(e.userId) ?? [];
    list.push(e.courseId);
    assignedByStudent.set(e.userId, list);
  }

  // Progress per student — one attempts lookup each, fine at this scale.
  const progress = await Promise.all(
    students.map(async (s) => {
      const assigned = assignedByStudent.get(s.id) ?? [];
      const latest = await latestAttemptsByModule(s.id);
      let complete = 0;
      for (const courseId of assigned) {
        const mids = courseModuleIds.get(courseId) ?? [];
        // An empty course can't be "done"; require ≥1 module all passed.
        if (mids.length > 0 && mids.every((mid) => latest.get(mid)?.passed)) complete++;
      }
      return { id: s.id, assigned, complete };
    }),
  );
  const progressById = new Map(progress.map((p) => [p.id, p]));

  const rows: StudentRow[] = students.map((s) => {
    const p = progressById.get(s.id);
    const assigned = p?.assigned ?? [];
    return {
      id: s.id,
      name: s.name ?? "",
      loginEmail: s.email,
      isSynthetic: s.email.endsWith(`@${SYNTH_LOGIN_DOMAIN}`),
      phone: s.phone,
      mustChangePassword: s.mustChangePassword,
      createdAt: s.createdAt.toISOString(),
      courseIds: assigned,
      coursesAssigned: assigned.length,
      coursesComplete: p?.complete ?? 0,
    };
  });

  const courseOptions: CourseOption[] = courses.map((c) => ({
    id: c.id,
    title: c.titleEn || c.titleId,
    published: c.published,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Students</h1>
          <p className="text-sm text-muted-foreground">
            Give people a login to the learning portal and track their progress.
          </p>
        </div>
        <AddStudentDialog courses={courseOptions} />
      </header>

      <StudentsClient students={rows} courses={courseOptions} />
    </div>
  );
}
