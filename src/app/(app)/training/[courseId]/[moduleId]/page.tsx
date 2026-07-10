import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, GraduationCap } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { isEnrolledOrFree } from "@/server/enrollment";
import { sanitizeQuestion, type LocalizedOption } from "@/server/training";
import { Button } from "@/components/ui/button";
import { pickLocalized } from "@/components/shared/localized-text";
import { latestAttemptsByModule } from "@/app/(app)/training/progress";
import {
  PlayerClient,
  type PlayerQuestion,
  type PlayerVideo,
} from "@/app/(app)/training/[courseId]/[moduleId]/player-client";
import { ScormSection } from "@/app/(app)/training/[courseId]/[moduleId]/scorm-section";

export const dynamic = "force-dynamic";

type CourseModuleDetail = {
  rank: number;
  course: { id: string; titleEn: string; titleId: string; published: boolean };
  module: {
    id: string;
    titleEn: string;
    titleId: string;
    bodyEn: string | null;
    bodyId: string | null;
    imageMime: string | null;
    passPct: number;
    scormPath: string | null;
    video: {
      type: "YOUTUBE" | "UPLOAD";
      url: string | null;
      path: string | null;
    } | null;
    questions: {
      id: string;
      type: "MULTIPLE_CHOICE" | "FILL_BLANK" | "ORDER" | "PHOTO_SPOT";
      promptEn: string;
      promptId: string;
      imageMime: string | null;
      config: unknown;
    }[];
  };
};

export default async function ModulePlayerPage({
  params,
}: {
  params: Promise<{ courseId: string; moduleId: string }>;
}) {
  const { courseId, moduleId } = await params;
  const session = await auth();
  const isSuperuser = session?.user?.role === "SUPERUSER";
  const userId = session?.user?.id ?? "";
  const rawLocale = await getLocale();
  const locale: "en" | "id" = rawLocale === "id" ? "id" : "en";
  const t = await getTranslations("training");

  // Load through the CourseModule JOIN — a module only plays inside a course
  // it actually belongs to (typing a foreign moduleId into the URL 404s).
  // findFirst (not findUnique) so the prisma extension can append the
  // organizationId predicate. The image blobs stay out of the select — the
  // player fetches them through /api/training/image/* instead.
  const courseModule = (await prisma.courseModule.findFirst({
    where: { courseId, moduleId },
    select: {
      rank: true,
      course: { select: { id: true, titleEn: true, titleId: true, published: true } },
      module: {
        select: {
          id: true,
          titleEn: true,
          titleId: true,
          bodyEn: true,
          bodyId: true,
          imageMime: true,
          passPct: true,
          scormPath: true,
          video: { select: { type: true, url: true, path: true } },
          questions: {
            orderBy: { rank: "asc" },
            select: {
              id: true,
              type: true,
              promptEn: true,
              promptId: true,
              imageMime: true,
              config: true,
            },
          },
        },
      },
    },
  })) as CourseModuleDetail | null;
  if (!courseModule) notFound();
  const { course, module: mod } = courseModule;
  if (!course.published && !isSuperuser) notFound();

  // Paid-course gate — same rule submitModuleAttempt/recordScormCompletion
  // enforce server-side: a priced course only plays for enrolled learners.
  if (!isSuperuser && !(await isEnrolledOrFree(courseId, userId, session?.user?.role))) {
    redirect(`/training/${courseId}`);
  }

  // Lock enforcement lives HERE, not just in the course-list UI: a staff
  // member typing the URL of module 5 gets bounced back to the course page
  // until every earlier-ranked module (in THIS course) has a passing latest
  // attempt.
  const siblings = (await prisma.courseModule.findMany({
    where: { courseId },
    orderBy: { rank: "asc" },
    select: { moduleId: true, rank: true },
  })) as { moduleId: string; rank: number }[];
  const latest = await latestAttemptsByModule(
    userId,
    siblings.map((s) => s.moduleId),
  );
  if (!isSuperuser) {
    const blocked = siblings.some(
      (s) => s.rank < courseModule.rank && !latest.get(s.moduleId)?.passed,
    );
    if (blocked) redirect(`/training/${courseId}`);
  }

  const position = siblings.findIndex((s) => s.moduleId === mod.id);
  const next = position >= 0 ? siblings[position + 1] : undefined;
  const nextModuleHref = next ? `/training/${courseId}/${next.moduleId}` : null;

  // Sanitize EVERY question server-side — the client only ever receives the
  // answer-free config (options/items), never the raw `config` JSON, which
  // contains `correct` / `accept` / the true item order.
  const questions: PlayerQuestion[] = mod.questions.map((q) => {
    const sanitized = sanitizeQuestion(q);
    const cfg = sanitized.config as {
      options?: LocalizedOption[];
      items?: LocalizedOption[];
    };
    return {
      id: q.id,
      type: q.type,
      prompt: pickLocalized({ en: q.promptEn, id: q.promptId }, locale),
      hasImage: Boolean(q.imageMime),
      options: (cfg.options ?? []).map((o) => pickLocalized(o, locale)),
      // ORDER: items arrive pre-shuffled; the tag is just the DISPLAYED
      // position. The client never learns the original order — marking
      // recomputes the same seeded shuffle server-side (review finding:
      // shipping original indexes here handed out the answer key).
      orderItems:
        q.type === "ORDER"
          ? (cfg.items ?? []).map((item, i) => ({
              tag: i,
              label: pickLocalized(item, locale),
            }))
          : [],
    };
  });

  const video: PlayerVideo | null = mod.video
    ? { type: mod.video.type, url: mod.video.url, path: mod.video.path }
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href={`/training/${courseId}`}>
            <ArrowLeft className="h-4 w-4" />{" "}
            {pickLocalized({ en: course.titleEn, id: course.titleId }, locale)}
          </Link>
        </Button>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
          <GraduationCap className="h-3.5 w-3.5" />
          {t("moduleNumber", { n: position + 1 })}
        </span>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl">
          {pickLocalized({ en: mod.titleEn, id: mod.titleId }, locale)}
        </h1>
      </div>

      {mod.scormPath ? (
        /* SCORM module: the SCO is the whole experience — it teaches, assesses
           and reports its own completion (recordScormCompletion applies the
           same server-side gates as the quiz path). scormPath is
           "<moduleId>|<launchHref>"; the href may itself contain "|". */
        <ScormSection
          courseId={course.id}
          moduleId={mod.id}
          launchUrl={`/api/scorm/${mod.id}/${mod.scormPath.split("|").slice(1).join("|")}`}
          studentId={userId}
          studentName={session?.user?.name ?? ""}
          body={pickLocalized({ en: mod.bodyEn, id: mod.bodyId }, locale) || null}
          nextModuleHref={nextModuleHref}
          courseHref={`/training/${courseId}`}
        />
      ) : (
        <PlayerClient
          courseId={course.id}
          moduleId={mod.id}
          courseHref={`/training/${courseId}`}
          nextModuleHref={nextModuleHref}
          passPct={mod.passPct}
          video={video}
          hasImage={Boolean(mod.imageMime)}
          body={pickLocalized({ en: mod.bodyEn, id: mod.bodyId }, locale) || null}
          questions={questions}
        />
      )}
    </div>
  );
}
