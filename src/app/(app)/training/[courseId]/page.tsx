import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, CheckCircle2, ChevronRight, Lock, Pencil } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LocalizedText } from "@/components/shared/localized-text";
import { latestAttemptsByLesson } from "@/app/(app)/training/progress";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type CourseDetail = {
  id: string;
  titleEn: string;
  titleId: string;
  description: string | null;
  published: boolean;
  lessons: {
    id: string;
    rank: number;
    titleEn: string;
    titleId: string;
    _count: { questions: number };
  }[];
};

type LessonState = "PASSED" | "UNLOCKED" | "LOCKED";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const session = await auth();
  const isSuperuser = session?.user?.role === "SUPERUSER";
  const userId = session?.user?.id ?? "";
  const t = await getTranslations("training");

  // findFirst (not findUnique) so the prisma extension can append the
  // organizationId predicate for org isolation. Drafts 404 for staff.
  const course = (await prisma.course.findFirst({
    where: { id: courseId, ...(isSuperuser ? {} : { published: true }) },
    select: {
      id: true,
      titleEn: true,
      titleId: true,
      description: true,
      published: true,
      lessons: {
        orderBy: { rank: "asc" },
        select: {
          id: true,
          rank: true,
          titleEn: true,
          titleId: true,
          _count: { select: { questions: true } },
        },
      },
    },
  })) as CourseDetail | null;
  if (!course) notFound();

  const latest = await latestAttemptsByLesson(
    userId,
    course.lessons.map((l) => l.id),
  );

  // Lessons in rank order: passed lessons stay green, the FIRST not-passed
  // one is the unlocked "you are here" step, everything after it is locked.
  // Superusers get everything unlocked so they can spot-check any lesson
  // without grinding through the course.
  const firstNotPassedId =
    course.lessons.find((l) => !latest.get(l.id)?.passed)?.id ?? null;
  const rows = course.lessons.map((lesson) => {
    const attempt = latest.get(lesson.id);
    const state: LessonState = attempt?.passed
      ? "PASSED"
      : lesson.id === firstNotPassedId || isSuperuser
        ? "UNLOCKED"
        : "LOCKED";
    return { lesson, state, score: attempt?.score ?? null };
  });

  const done = rows.filter((r) => r.state === "PASSED").length;
  const total = rows.length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/training">
            <ArrowLeft className="h-4 w-4" /> {t("allCourses")}
          </Link>
        </Button>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl">
              <LocalizedText en={course.titleEn} id={course.titleId} />
            </h1>
            {course.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{course.description}</p>
            ) : null}
            <p className="mt-2 text-sm text-muted-foreground">
              {t("progress", { done, total })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!course.published ? <Badge variant="secondary">{t("draft")}</Badge> : null}
            {isSuperuser ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/training/${course.id}/edit`}>
                  <Pencil className="h-4 w-4" /> {t("edit")}
                </Link>
              </Button>
            ) : null}
          </div>
        </header>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            {t("noLessons")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {rows.map(({ lesson, state, score }, idx) => {
                const number = idx + 1;
                const inner = (
                  <>
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                        state === "PASSED"
                          ? "border-transparent bg-emerald-100 text-emerald-700"
                          : state === "UNLOCKED"
                            ? "border-accent bg-accent/10 text-foreground"
                            : "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {state === "PASSED" ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : state === "LOCKED" ? (
                        <Lock className="h-4 w-4" />
                      ) : (
                        number
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        <LocalizedText en={lesson.titleEn} id={lesson.titleId} />
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t("questionCount", { count: lesson._count.questions })}
                      </span>
                    </span>
                    {state === "PASSED" ? (
                      <span className="shrink-0 text-sm font-medium text-emerald-600">
                        {t("passed")}
                        {score !== null ? ` · ${score}%` : ""}
                      </span>
                    ) : state === "UNLOCKED" ? (
                      <span className="inline-flex h-10 shrink-0 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
                        {t("start")}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                        {t("locked")}
                      </span>
                    )}
                    {state !== "LOCKED" ? (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : null}
                  </>
                );
                return (
                  <li key={lesson.id}>
                    {state === "LOCKED" ? (
                      <div className="flex items-center gap-3 p-4 opacity-60">{inner}</div>
                    ) : (
                      <Link
                        href={`/training/${course.id}/${lesson.id}`}
                        className="flex items-center gap-3 p-4 transition-colors hover:bg-accent/5"
                      >
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
