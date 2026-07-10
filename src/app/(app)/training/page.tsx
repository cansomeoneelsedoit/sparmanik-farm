import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { GraduationCap, Pencil, Plus } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LocalizedText } from "@/components/shared/localized-text";
import { latestAttemptsByLesson } from "@/app/(app)/training/progress";
import { FromYouTubeDialog } from "@/app/(app)/training/from-youtube-dialog";

export const dynamic = "force-dynamic";

type CourseRow = {
  id: string;
  titleEn: string;
  titleId: string;
  description: string | null;
  published: boolean;
  lessons: { id: string }[];
};

export default async function TrainingPage() {
  const session = await auth();
  const isSuperuser = session?.user?.role === "SUPERUSER";
  const userId = session?.user?.id ?? "";
  const t = await getTranslations("training");

  // Staff only ever see published courses; the owner sees drafts too (with a
  // Draft badge) so they can check their work before flipping the switch.
  const courses = (await prisma.course.findMany({
    where: isSuperuser ? {} : { published: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      titleEn: true,
      titleId: true,
      description: true,
      published: true,
      lessons: { select: { id: true }, orderBy: { rank: "asc" } },
    },
  })) as CourseRow[];

  const latest = await latestAttemptsByLesson(userId);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {isSuperuser ? (
          <div className="flex items-center gap-2">
            <FromYouTubeDialog />
            <Button asChild>
              <Link href="/training/new">
                <Plus className="h-4 w-4" /> {t("newCourse")}
              </Link>
            </Button>
          </div>
        ) : null}
      </header>

      {courses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground">
            <GraduationCap className="h-8 w-8 opacity-50" />
            {t("empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => {
            const total = course.lessons.length;
            const done = course.lessons.filter((l) => latest.get(l.id)?.passed).length;
            const pct = total === 0 ? 0 : Math.round((done / total) * 100);
            return (
              <Card key={course.id} className="overflow-hidden">
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/training/${course.id}`}
                      className="min-w-0 flex-1 font-medium leading-snug hover:underline"
                    >
                      <LocalizedText en={course.titleEn} id={course.titleId} />
                    </Link>
                    <div className="flex shrink-0 items-center gap-1">
                      {!course.published ? (
                        <Badge variant="secondary">{t("draft")}</Badge>
                      ) : null}
                      {isSuperuser ? (
                        <Button asChild size="icon" variant="ghost" title={t("edit")}>
                          <Link href={`/training/${course.id}/edit`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {course.description ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {course.description}
                    </p>
                  ) : null}
                  <div className="mt-auto space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t("progress", { done, total })}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <Button asChild variant="outline" className="h-11 w-full">
                    <Link href={`/training/${course.id}`}>
                      {done >= total && total > 0 ? t("review") : t("start")}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
