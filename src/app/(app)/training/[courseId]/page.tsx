import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  ArrowLeft,
  Award,
  BookOpen,
  Check,
  ChevronRight,
  GraduationCap,
  Lock,
  Pencil,
} from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { isEnrolledOrFree } from "@/server/enrollment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LocalizedText } from "@/components/shared/localized-text";
import { coverArtFor } from "@/lib/cover-art";
import { CourseAccessNotice } from "@/app/(app)/training/course-access-notice";
import { latestAttemptsByModule } from "@/app/(app)/training/progress";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type CourseDetail = {
  id: string;
  titleEn: string;
  titleId: string;
  description: string | null;
  published: boolean;
  imageMime: string | null;
  /** Prisma Decimal on the server — only .toFixed is ever called on it. */
  priceIdr: { toFixed(fractionDigits?: number): string } | null;
  modules: {
    rank: number;
    module: {
      id: string;
      titleEn: string;
      titleId: string;
      _count: { questions: number };
    };
  }[];
};

type ModuleState = "PASSED" | "UNLOCKED" | "LOCKED";

/** White-on-cover completion ring for the hero (server-rendered SVG). */
function HeroProgressRing({ pct, done, total }: { pct: number; done: number; total: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90">
        <circle cx={48} cy={48} r={r} fill="none" strokeWidth={7} stroke="rgba(255,255,255,0.25)" />
        <circle
          cx={48}
          cy={48}
          r={r}
          fill="none"
          strokeWidth={7}
          stroke="#fff"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(100, pct)) / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <span className="font-serif text-2xl leading-none drop-shadow-sm">{pct}%</span>
        <span className="mt-1 text-[10px] font-semibold tracking-wide text-white/80">
          {done}/{total}
        </span>
      </div>
    </div>
  );
}

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
  // Modules come through the CourseModule join in rank order.
  const course = (await prisma.course.findFirst({
    where: { id: courseId, ...(isSuperuser ? {} : { published: true }) },
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
        select: {
          rank: true,
          module: {
            select: {
              id: true,
              titleEn: true,
              titleId: true,
              _count: { select: { questions: true } },
            },
          },
        },
      },
    },
  })) as CourseDetail | null;
  if (!course) notFound();

  const latest = await latestAttemptsByModule(
    userId,
    course.modules.map((m) => m.module.id),
  );

  // Paid-course gate: true for superusers, free courses, and enrolled
  // learners. Without access every module renders locked (and the server
  // actions refuse attempts regardless of what the UI shows).
  const hasAccess = await isEnrolledOrFree(course.id, userId, session?.user?.role);

  // Modules in join-rank order: passed modules stay green, the FIRST
  // not-passed one is the unlocked "you are here" step, everything after it
  // is locked. Superusers get everything unlocked so they can spot-check any
  // module without grinding through the course.
  const firstNotPassedId =
    course.modules.find((m) => !latest.get(m.module.id)?.passed)?.module.id ?? null;
  const rows = course.modules.map(({ module: mod }) => {
    const attempt = latest.get(mod.id);
    const state: ModuleState = !hasAccess
      ? "LOCKED"
      : attempt?.passed
        ? "PASSED"
        : mod.id === firstNotPassedId || isSuperuser
          ? "UNLOCKED"
          : "LOCKED";
    return { mod, state, score: attempt?.score ?? null };
  });

  const done = rows.filter((r) => r.state === "PASSED").length;
  const total = rows.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const allPassed = total > 0 && done === total;

  const priceN = course.priceIdr ? Number(course.priceIdr.toFixed(0)) : 0;
  const price =
    Number.isFinite(priceN) && priceN > 0
      ? `Rp ${new Intl.NumberFormat("id-ID").format(priceN)}`
      : null;
  const art = coverArtFor(course.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/training">
            <ArrowLeft className="h-4 w-4" /> {t("allCourses")}
          </Link>
        </Button>
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
      </div>

      {/* Hero — uploaded cover (dark scrim for legibility) or the generated
          gradient with a GraduationCap watermark. White serif title on top. */}
      <header className="relative overflow-hidden rounded-xl border shadow-sm">
        {course.imageMime ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/training/image/course/${course.id}`}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/20" />
          </>
        ) : (
          <>
            <div className="absolute inset-0" style={{ backgroundImage: art.background }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            <GraduationCap
              aria-hidden
              className="absolute -right-6 -top-6 h-40 w-40 rotate-12 text-white/10"
            />
          </>
        )}
        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="min-w-0 max-w-xl space-y-3">
            <h1 className="font-serif text-3xl text-white drop-shadow-sm sm:text-4xl">
              <LocalizedText en={course.titleEn} id={course.titleId} />
            </h1>
            {course.description ? (
              <p className="text-sm leading-relaxed text-white/85 drop-shadow-sm sm:text-base">
                {course.description}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                <BookOpen className="h-3 w-3" /> {t("moduleCount", { count: total })}
              </span>
              <span className="inline-flex items-center rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                {price ?? t("free")}
              </span>
            </div>
          </div>
          {total > 0 ? <HeroProgressRing pct={pct} done={done} total={total} /> : null}
        </div>
      </header>

      <CourseAccessNotice
        courseId={course.id}
        priceIdrLabel={new Intl.NumberFormat("id-ID").format(priceN)}
        enrolled={hasAccess}
        isPrivileged={isSuperuser}
      />

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center text-muted-foreground">
            {t("noModules")}
          </CardContent>
        </Card>
      ) : (
        /* Learning path — numbered nodes on a vertical line. Passed = filled
           emerald, current = accent ring, locked = muted with a padlock. */
        <ol className="pt-1">
          {rows.map(({ mod, state, score }, idx) => {
            const number = idx + 1;
            const last = idx === rows.length - 1;
            const content = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium leading-snug">
                    <LocalizedText en={mod.titleEn} id={mod.titleId} />
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("questionCount", { count: mod._count.questions })}
                  </span>
                </span>
                {state === "PASSED" ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <Check className="h-3 w-3" />
                    {t("passed")}
                    {score !== null ? ` · ${score}%` : ""}
                  </span>
                ) : state === "UNLOCKED" ? (
                  <span className="inline-flex h-10 shrink-0 items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground shadow-sm">
                    {t("start")}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("locked")}
                  </span>
                )}
                {state !== "LOCKED" ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : null}
              </>
            );
            return (
              <li key={mod.id} className="relative flex gap-4">
                {/* Node + connector segment down to the next node. */}
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold",
                      state === "PASSED"
                        ? "border-transparent bg-emerald-500 text-white"
                        : state === "UNLOCKED"
                          ? "border-accent bg-card text-foreground ring-4 ring-accent/20"
                          : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {state === "PASSED" ? (
                      <Check className="h-5 w-5" />
                    ) : state === "LOCKED" ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      number
                    )}
                  </span>
                  {!last ? (
                    <span
                      aria-hidden
                      className={cn(
                        "-my-1 w-0.5 flex-1 rounded-full",
                        state === "PASSED"
                          ? "bg-emerald-300 dark:bg-emerald-500/40"
                          : "bg-border",
                      )}
                    />
                  ) : null}
                </div>
                <div className={cn("min-w-0 flex-1", !last && "pb-4")}>
                  {state === "LOCKED" ? (
                    <div className="flex items-center gap-3 rounded-lg border border-dashed bg-card p-4 opacity-60">
                      {content}
                    </div>
                  ) : (
                    <Link
                      href={`/training/${course.id}/${mod.id}`}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm transition-colors",
                        state === "UNLOCKED"
                          ? "border-accent/50 hover:border-accent hover:bg-accent/5"
                          : "hover:bg-muted/50",
                      )}
                    >
                      {content}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* Published only — the certificate page refuses drafts, so a superuser
          previewing a draft they happen to have passed gets no dead button. */}
      {allPassed && course.published ? (
        <div className="relative overflow-hidden rounded-xl border border-amber-300/60 bg-gradient-to-r from-amber-50 via-amber-100/60 to-emerald-50 p-6 dark:border-amber-400/20 dark:from-amber-500/10 dark:via-amber-400/5 dark:to-emerald-500/10">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow-md ring-4 ring-amber-200/70 dark:ring-amber-400/20">
              <Award className="h-7 w-7" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-2xl">{t("courseCompleteTitle")}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("courseCompleteBody")}</p>
            </div>
            <Button asChild size="lg" className="h-12 shrink-0">
              <a
                href={`/print/certificate/${course.id}?auto=1`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Award className="h-5 w-5" /> {t("getCertificate")}
              </a>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
