import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Award, BookOpen, GraduationCap, Library, Pencil, Plus } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { pickLocalized } from "@/components/shared/localized-text";
import { coverArtFor } from "@/lib/cover-art";
import { latestAttemptsByModule } from "@/app/(app)/training/progress";
import { FromYouTubeDialog } from "@/app/(app)/training/from-youtube-dialog";
import { TrainingSearch } from "@/app/(app)/training/training-search";

export const dynamic = "force-dynamic";

type CourseRow = {
  id: string;
  titleEn: string;
  titleId: string;
  description: string | null;
  published: boolean;
  imageMime: string | null;
  /** Prisma Decimal on the server — only .toFixed is ever called on it. */
  priceIdr: { toFixed(fractionDigits?: number): string } | null;
  modules: { rank: number; module: { id: string } }[];
};

/** "Rp 150.000" (id-ID grouping) for priced courses, null when free. */
function priceLabel(priceIdr: CourseRow["priceIdr"]): string | null {
  const n = priceIdr ? Number(priceIdr.toFixed(0)) : 0;
  if (!Number.isFinite(n) || n <= 0) return null;
  return `Rp ${new Intl.NumberFormat("id-ID").format(n)}`;
}

/**
 * Course-card banner: the uploaded cover picture when there is one, otherwise
 * the deterministic gradient (cover-art.ts) with a big serif initial and a
 * GraduationCap watermark so even art-less courses look designed.
 */
function CoverBanner({
  courseId,
  title,
  hasImage,
}: {
  courseId: string;
  title: string;
  hasImage: boolean;
}) {
  const art = coverArtFor(courseId);
  const initial = (title.trim()[0] ?? "?").toUpperCase();
  return (
    <div className="relative h-32 w-full overflow-hidden">
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/training/image/course/${courseId}`}
          alt=""
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center"
          style={{ backgroundImage: art.background }}
        >
          <span className="font-serif text-6xl text-white/90 drop-shadow-sm">{initial}</span>
          <GraduationCap
            aria-hidden
            className="absolute -bottom-4 -right-3 h-24 w-24 -rotate-12 text-white/15"
          />
        </div>
      )}
    </div>
  );
}

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const session = await auth();
  const isSuperuser = session?.user?.role === "SUPERUSER";
  const userId = session?.user?.id ?? "";
  const t = await getTranslations("training");
  const rawLocale = await getLocale();
  const locale: "en" | "id" = rawLocale === "id" ? "id" : "en";

  // Staff only ever see published courses; the owner sees drafts too (with a
  // Draft badge) so they can check their work before flipping the switch.
  // Search hits both title languages plus the description, case-insensitive.
  const courses = (await prisma.course.findMany({
    where: {
      ...(isSuperuser ? {} : { published: true }),
      ...(q
        ? {
            OR: [
              { titleEn: { contains: q, mode: "insensitive" as const } },
              { titleId: { contains: q, mode: "insensitive" as const } },
              { description: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      titleEn: true,
      titleId: true,
      description: true,
      published: true,
      imageMime: true,
      priceIdr: true,
      modules: {
        orderBy: { rank: "asc" },
        select: { rank: true, module: { select: { id: true } } },
      },
    },
  })) as CourseRow[];

  const latest = await latestAttemptsByModule(userId);

  // Courses the user is enrolled in — a priced course only counts as
  // "completed" (and shows a certificate button) with an enrollment, even if
  // its modules were reused from a free course and their attempts passed.
  const enrolledCourseIds = new Set(
    (
      (await prisma.courseEnrollment.findMany({
        where: { userId },
        select: { courseId: true },
      })) as { courseId: string }[]
    ).map((e) => e.courseId),
  );
  const hasCourseAccess = (course: CourseRow) => {
    if (isSuperuser) return true;
    const n = course.priceIdr ? Number(course.priceIdr.toFixed(0)) : 0;
    if (!Number.isFinite(n) || n <= 0) return true;
    return enrolledCourseIds.has(course.id);
  };

  const withProgress = courses.map((course) => {
    const moduleIds = course.modules.map((m) => m.module.id);
    const total = moduleIds.length;
    const done = moduleIds.filter((id) => latest.get(id)?.passed).length;
    return { course, total, done };
  });

  // Completed = EVERY module's latest attempt passed. Published only — the
  // certificate page refuses drafts, so a draft here would be a dead button.
  // Paid courses also require an enrollment, matching the certificate gate.
  const completed = withProgress.filter(
    ({ course, total, done }) =>
      course.published && total > 0 && done === total && hasCourseAccess(course),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {isSuperuser ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/training/modules">
                <Library className="h-4 w-4" /> {t("moduleLibrary")}
              </Link>
            </Button>
            <FromYouTubeDialog />
            <Button asChild>
              <Link href="/training/new">
                <Plus className="h-4 w-4" /> {t("newCourse")}
              </Link>
            </Button>
          </div>
        ) : null}
      </header>

      <TrainingSearch />

      {withProgress.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
              <GraduationCap className="h-7 w-7 text-accent" />
            </span>
            {q ? t("noResults") : t("empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {withProgress.map(({ course, total, done }) => {
            const pct = total === 0 ? 0 : Math.round((done / total) * 100);
            const title = pickLocalized({ en: course.titleEn, id: course.titleId }, locale);
            const price = priceLabel(course.priceIdr);
            return (
              <Card
                key={course.id}
                className="group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <CardContent className="flex h-full flex-col p-0">
                  <Link href={`/training/${course.id}`} className="block">
                    <CoverBanner
                      courseId={course.id}
                      title={title}
                      hasImage={Boolean(course.imageMime)}
                    />
                  </Link>
                  <div className="flex flex-1 flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/training/${course.id}`}
                        className="min-w-0 flex-1 font-serif text-xl leading-snug hover:underline"
                      >
                        {title}
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        <BookOpen className="h-3 w-3" /> {t("moduleCount", { count: total })}
                      </span>
                      {price ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                          {price}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                          {t("free")}
                        </span>
                      )}
                    </div>
                    <div className="mt-auto space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t("progress", { done, total })}</span>
                        <span className="font-medium">{pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
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
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {completed.length > 0 ? (
        <section className="space-y-3 pt-2">
          <h2 className="flex items-center gap-2 font-serif text-xl">
            <Award className="h-5 w-5 text-amber-500" /> {t("completedSection")}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {completed.map(({ course, total }) => {
              const title = pickLocalized({ en: course.titleEn, id: course.titleId }, locale);
              return (
                <Card
                  key={course.id}
                  className="group overflow-hidden border-amber-200 transition hover:-translate-y-0.5 hover:shadow-lg dark:border-amber-400/25"
                >
                  <CardContent className="flex h-full flex-col p-0">
                    <Link href={`/training/${course.id}`} className="relative block">
                      <CoverBanner
                        courseId={course.id}
                        title={title}
                        hasImage={Boolean(course.imageMime)}
                      />
                      {/* Gold medal riding the banner edge — the "you earned
                          this" treatment for finished courses. */}
                      <span className="absolute -bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow-md ring-4 ring-card">
                        <Award className="h-5 w-5" />
                      </span>
                    </Link>
                    <div className="flex flex-1 flex-col gap-3 p-5">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/training/${course.id}`}
                          className="min-w-0 flex-1 font-serif text-xl leading-snug hover:underline"
                        >
                          {title}
                        </Link>
                        <Badge className="mr-10 shrink-0 border-transparent bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/15">
                          {t("completed")}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t("moduleCount", { count: total })}
                      </p>
                      {/* target=_blank like the harvest PDF button — the print page
                          auto-opens the browser's Save-as-PDF dialog via ?auto=1. */}
                      <Button
                        asChild
                        variant="outline"
                        className="mt-auto h-11 w-full border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20 dark:hover:text-amber-100"
                      >
                        <a
                          href={`/print/certificate/${course.id}?auto=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Award className="h-4 w-4" /> {t("certificate")}
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
