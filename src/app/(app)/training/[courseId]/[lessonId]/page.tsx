import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { sanitizeQuestion, type LocalizedOption } from "@/server/training";
import { Button } from "@/components/ui/button";
import { pickLocalized } from "@/components/shared/localized-text";
import { latestAttemptsByLesson } from "@/app/(app)/training/progress";
import {
  PlayerClient,
  type PlayerQuestion,
  type PlayerVideo,
} from "@/app/(app)/training/[courseId]/[lessonId]/player-client";

export const dynamic = "force-dynamic";

type LessonDetail = {
  id: string;
  rank: number;
  titleEn: string;
  titleId: string;
  bodyEn: string | null;
  bodyId: string | null;
  imageMime: string | null;
  passPct: number;
  course: { id: string; titleEn: string; titleId: string; published: boolean };
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

export default async function LessonPlayerPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  const session = await auth();
  const isSuperuser = session?.user?.role === "SUPERUSER";
  const userId = session?.user?.id ?? "";
  const rawLocale = await getLocale();
  const locale: "en" | "id" = rawLocale === "id" ? "id" : "en";
  const t = await getTranslations("training");

  // findFirst (not findUnique) so the prisma extension can append the
  // organizationId predicate. The image blobs stay out of the select — the
  // player fetches them through /api/training/image/* instead.
  const lesson = (await prisma.lesson.findFirst({
    where: { id: lessonId, courseId },
    select: {
      id: true,
      rank: true,
      titleEn: true,
      titleId: true,
      bodyEn: true,
      bodyId: true,
      imageMime: true,
      passPct: true,
      course: { select: { id: true, titleEn: true, titleId: true, published: true } },
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
  })) as LessonDetail | null;
  if (!lesson) notFound();
  if (!lesson.course.published && !isSuperuser) notFound();

  // Lock enforcement lives HERE, not just in the course-list UI: a staff
  // member typing the URL of lesson 5 gets bounced back to the course page
  // until every earlier-ranked lesson's latest attempt passed.
  const siblings = (await prisma.lesson.findMany({
    where: { courseId },
    orderBy: { rank: "asc" },
    select: { id: true, rank: true },
  })) as { id: string; rank: number }[];
  const latest = await latestAttemptsByLesson(
    userId,
    siblings.map((s) => s.id),
  );
  if (!isSuperuser) {
    const blocked = siblings.some(
      (s) => s.rank < lesson.rank && !latest.get(s.id)?.passed,
    );
    if (blocked) redirect(`/training/${courseId}`);
  }

  const position = siblings.findIndex((s) => s.id === lesson.id);
  const next = position >= 0 ? siblings[position + 1] : undefined;
  const nextLessonHref = next ? `/training/${courseId}/${next.id}` : null;

  // Sanitize EVERY question server-side — the client only ever receives the
  // answer-free config (options/items), never the raw `config` JSON, which
  // contains `correct` / `accept` / the true item order.
  const questions: PlayerQuestion[] = lesson.questions.map((q) => {
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

  const video: PlayerVideo | null = lesson.video
    ? { type: lesson.video.type, url: lesson.video.url, path: lesson.video.path }
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href={`/training/${courseId}`}>
            <ArrowLeft className="h-4 w-4" />{" "}
            {pickLocalized({ en: lesson.course.titleEn, id: lesson.course.titleId }, locale)}
          </Link>
        </Button>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("lessonNumber", { n: position + 1 })}
        </p>
        <h1 className="font-serif text-3xl">
          {pickLocalized({ en: lesson.titleEn, id: lesson.titleId }, locale)}
        </h1>
      </div>

      <PlayerClient
        lessonId={lesson.id}
        courseHref={`/training/${courseId}`}
        nextLessonHref={nextLessonHref}
        passPct={lesson.passPct}
        video={video}
        hasImage={Boolean(lesson.imageMime)}
        body={pickLocalized({ en: lesson.bodyEn, id: lesson.bodyId }, locale) || null}
        questions={questions}
      />
    </div>
  );
}
