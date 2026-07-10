"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  X,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { submitLessonAttempt } from "@/app/(app)/training/actions";

export type PlayerVideo = {
  type: "YOUTUBE" | "UPLOAD";
  url: string | null;
  path: string | null;
};

export type PlayerQuestion = {
  id: string;
  type: "MULTIPLE_CHOICE" | "FILL_BLANK" | "ORDER" | "PHOTO_SPOT";
  /** Prompt already localized server-side. */
  prompt: string;
  /** Render the question image from /api/training/image/question/[id]. */
  hasImage: boolean;
  /** Localized option labels (MULTIPLE_CHOICE / PHOTO_SPOT), answer-free. */
  options: string[];
  /** ORDER only: SHUFFLED items; `tag` is the DISPLAYED position (0-based).
   *  Submit tags in the user's chosen order — the server re-derives the
   *  shuffle when marking, so the correct order never reaches the client. */
  orderItems: { tag: number; label: string }[];
};

type Answer = number[] | string;

type AttemptResult = {
  score: number;
  passed: boolean;
  perQuestion: Record<string, boolean>;
};

// ---------------------------------------------------------------------------
// Video embed — same platform detection as the Videos page dialog
// (src/app/(app)/videos/video-play-button.tsx), rendered inline instead of in
// a dialog. Uploads play from /api/uploads; YouTube/TikTok/Instagram embed
// via their iframe endpoints; anything else gets an "open in new tab" card.
// ---------------------------------------------------------------------------

function parseYoutubeId(url: string): string | null {
  const m1 = url.match(/youtu\.be\/([\w-]{11})/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]v=([\w-]{11})/);
  if (m2) return m2[1];
  const m3 = url.match(/youtube\.com\/shorts\/([\w-]{11})/);
  if (m3) return m3[1];
  return null;
}

function parseTiktokId(url: string): string | null {
  const m = url.match(/tiktok\.com\/[^/]+\/video\/(\d+)/);
  return m ? m[1] : null;
}

function parseInstagramCode(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:p|reel|tv)\/([\w-]+)/);
  return m ? m[1] : null;
}

type Platform = "youtube" | "tiktok" | "instagram" | "unknown";
function detectUrlPlatform(url: string): Platform {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("instagram.com")) return "instagram";
  return "unknown";
}

function LessonVideo({ video }: { video: PlayerVideo }) {
  const platform =
    video.type === "UPLOAD" ? "upload" : video.url ? detectUrlPlatform(video.url) : "unknown";
  const ytId = video.url && platform === "youtube" ? parseYoutubeId(video.url) : null;
  const ttId = video.url && platform === "tiktok" ? parseTiktokId(video.url) : null;
  const igCode = video.url && platform === "instagram" ? parseInstagramCode(video.url) : null;

  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      {platform === "upload" && video.path ? (
        <video src={`/api/uploads/${video.path}`} controls className="h-full w-full" />
      ) : ytId ? (
        <iframe
          src={`https://www.youtube.com/embed/${ytId}`}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : ttId ? (
        <iframe
          src={`https://www.tiktok.com/embed/v2/${ttId}`}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : igCode ? (
        <iframe
          src={`https://www.instagram.com/p/${igCode}/embed/`}
          className="h-full w-full"
          scrolling="no"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : video.url ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted p-6 text-center text-sm text-muted-foreground">
          <Button asChild size="sm" variant="outline">
            <a href={video.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> {video.url}
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player — content first, then questions one at a time, then the result.
// ---------------------------------------------------------------------------

export function PlayerClient({
  lessonId,
  courseHref,
  nextLessonHref,
  passPct,
  video,
  hasImage,
  body,
  questions,
}: {
  lessonId: string;
  courseHref: string;
  nextLessonHref: string | null;
  passPct: number;
  video: PlayerVideo | null;
  hasImage: boolean;
  /** Lesson body already localized server-side. */
  body: string | null;
  questions: PlayerQuestion[];
}) {
  const t = useTranslations("training");
  const tCommon = useTranslations("common");
  const [phase, setPhase] = useState<"content" | "questions" | "result">("content");
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function setAnswer(questionId: string, value: Answer) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  /** A question counts as answered once the widget has a complete input.
   *  Widgets with nothing to tap (bad data) never block the Next button. */
  function isAnswered(q: PlayerQuestion): boolean {
    const a = answers[q.id];
    if (q.type === "FILL_BLANK") return typeof a === "string" && a.trim() !== "";
    if (q.type === "ORDER") {
      if (q.orderItems.length === 0) return true;
      return Array.isArray(a) && a.length === q.orderItems.length;
    }
    if (q.options.length === 0) return true;
    return Array.isArray(a) && a.length > 0;
  }

  function handleSubmit() {
    startTransition(async () => {
      const res = await submitLessonAttempt({ lessonId, answers });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (!res.data) {
        toast.error(tCommon("error"));
        return;
      }
      setResult(res.data);
      setPhase("result");
    });
  }

  function handleTryAgain() {
    setAnswers({});
    setQIndex(0);
    setResult(null);
    setPhase("content");
  }

  /** Render the user's OWN answer (never the correct one) on the result screen. */
  function formatAnswer(q: PlayerQuestion): string {
    const a = answers[q.id];
    if (q.type === "FILL_BLANK") {
      return typeof a === "string" ? a.trim() : "";
    }
    if (q.type === "ORDER") {
      const tags = Array.isArray(a) ? a : [];
      const byTag = new Map(q.orderItems.map((item) => [item.tag, item.label]));
      return tags.map((tag) => byTag.get(tag) ?? "?").join(" → ");
    }
    const idxs = Array.isArray(a) ? a : [];
    return idxs.map((i) => q.options[i] ?? "?").join(", ");
  }

  // ---- Phase 1: teaching content -----------------------------------------
  if (phase === "content") {
    return (
      <div className="space-y-4">
        {video ? <LessonVideo video={video} /> : null}
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/training/image/lesson/${lessonId}`}
            alt=""
            className="w-full rounded-lg border object-contain"
          />
        ) : null}
        {body ? (
          <Card>
            <CardContent className="space-y-3 p-5 text-base leading-relaxed">
              {body.split(/\n+/).map((para, i) =>
                para.trim() ? <p key={i}>{para}</p> : null,
              )}
            </CardContent>
          </Card>
        ) : null}

        {questions.length === 0 ? (
          /* Content-only lesson: no quiz, so completing = viewing. Submitting
             the empty attempt records a 100% pass server-side and unlocks the
             next lesson (otherwise this lesson could never pass and would
             permanently lock everything after it — review finding). */
          <Card>
            <CardContent className="space-y-4 p-6 text-center">
              <p className="text-sm text-muted-foreground">{t("noQuestions")}</p>
              <Button
                size="lg"
                className="h-12 w-full sm:w-auto sm:px-8"
                disabled={isPending}
                onClick={handleSubmit}
              >
                {isPending ? "…" : t("markComplete")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Button
            size="lg"
            className="h-14 w-full text-base"
            onClick={() => setPhase("questions")}
          >
            {t("startQuestions")} <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  // ---- Phase 3: result -----------------------------------------------------
  if (phase === "result" && result) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            {result.passed ? (
              <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            ) : (
              <XCircle className="h-14 w-14 text-destructive" />
            )}
            <h2 className="font-serif text-2xl">
              {result.passed ? t("passedTitle") : t("failedTitle")}
            </h2>
            <p className="text-4xl font-semibold">{result.score}%</p>
            {!result.passed ? (
              <p className="text-sm text-muted-foreground">
                {t("needScore", { score: passPct })}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-2">
          {questions.map((q, i) => {
            const ok = result.perQuestion[q.id] === true;
            const given = formatAnswer(q);
            return (
              <Card key={q.id}>
                <CardContent className="flex items-start gap-3 p-4">
                  <span
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      ok ? "bg-emerald-100 text-emerald-700" : "bg-destructive/10 text-destructive",
                    )}
                  >
                    {ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {i + 1}. {q.prompt}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("yourAnswer")}: {given === "" ? t("noAnswer") : given}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-xs font-medium",
                      ok ? "text-emerald-600" : "text-destructive",
                    )}
                  >
                    {ok ? t("correct") : t("wrong")}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {result.passed ? (
            <>
              {nextLessonHref ? (
                <Button asChild size="lg" className="h-14 flex-1 text-base">
                  <Link href={nextLessonHref}>
                    {t("nextLesson")} <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
              <Button
                asChild
                size="lg"
                variant={nextLessonHref ? "outline" : "default"}
                className="h-14 flex-1 text-base"
              >
                <Link href={courseHref}>{t("backToCourse")}</Link>
              </Button>
            </>
          ) : (
            <>
              <Button size="lg" className="h-14 flex-1 text-base" onClick={handleTryAgain}>
                <RotateCcw className="h-4 w-4" /> {t("tryAgain")}
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 flex-1 text-base">
                <Link href={courseHref}>{t("backToCourse")}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---- Phase 2: questions, one at a time ----------------------------------
  const q = questions[qIndex];
  if (!q) return null;
  const isLast = qIndex === questions.length - 1;
  const answered = isAnswered(q);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm text-muted-foreground">
          {t("questionOf", { n: qIndex + 1, total: questions.length })}
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${((qIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <p className="text-lg font-medium leading-snug">{q.prompt}</p>
          {q.hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/training/image/question/${q.id}`}
              alt=""
              className="w-full rounded-lg border object-contain"
            />
          ) : null}

          {q.type === "MULTIPLE_CHOICE" || q.type === "PHOTO_SPOT" ? (
            <MultiSelect
              options={q.options}
              selected={Array.isArray(answers[q.id]) ? (answers[q.id] as number[]) : []}
              hint={t("multiHint")}
              onChange={(next) => setAnswer(q.id, next)}
            />
          ) : q.type === "FILL_BLANK" ? (
            <Input
              value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              placeholder={t("typeAnswer")}
              className="h-14 text-lg"
              autoFocus
            />
          ) : (
            <TapToOrder
              items={q.orderItems}
              picked={Array.isArray(answers[q.id]) ? (answers[q.id] as number[]) : []}
              hint={t("orderHint")}
              yourAnswerLabel={t("yourAnswer")}
              resetLabel={t("reset")}
              onChange={(next) => setAnswer(q.id, next)}
            />
          )}
        </CardContent>
      </Card>

      {isLast ? (
        <Button
          size="lg"
          className="h-14 w-full text-base"
          disabled={!answered || isPending}
          onClick={handleSubmit}
        >
          {isPending ? t("submitting") : t("submit")}
        </Button>
      ) : (
        <Button
          size="lg"
          className="h-14 w-full text-base"
          disabled={!answered}
          onClick={() => setQIndex((i) => i + 1)}
        >
          {t("next")} <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

/** Tappable multi-select option tiles (multiple choice + photo spot). */
function MultiSelect({
  options,
  selected,
  hint,
  onChange,
}: {
  options: string[];
  selected: number[];
  hint: string;
  onChange: (next: number[]) => void;
}) {
  function toggle(i: number) {
    onChange(selected.includes(i) ? selected.filter((s) => s !== i) : [...selected, i]);
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{hint}</p>
      {options.map((label, i) => {
        const on = selected.includes(i);
        return (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border-2 p-4 text-left text-base transition-colors",
              on
                ? "border-accent bg-accent/10 font-medium"
                : "border-border bg-background hover:border-accent/50",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
                on ? "border-accent bg-accent text-accent-foreground" : "border-muted-foreground/40",
              )}
            >
              {on ? <Check className="h-4 w-4" /> : null}
            </span>
            <span className="min-w-0 flex-1">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Tap-to-order v1 — no drag library. The shuffled items sit as tiles; tapping
 * one appends its `tag` (displayed position) to the ordered answer. Each placed
 * entry has an ✕ to send it back, plus a whole-answer reset.
 */
function TapToOrder({
  items,
  picked,
  hint,
  yourAnswerLabel,
  resetLabel,
  onChange,
}: {
  items: { tag: number; label: string }[];
  picked: number[];
  hint: string;
  yourAnswerLabel: string;
  resetLabel: string;
  onChange: (next: number[]) => void;
}) {
  const byTag = new Map(items.map((item) => [item.tag, item.label]));
  const remaining = items.filter((item) => !picked.includes(item.tag));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{hint}</p>

      <div className="space-y-2">
        {remaining.map((item) => (
          <button
            key={item.tag}
            type="button"
            onClick={() => onChange([...picked, item.tag])}
            className="flex w-full items-center gap-3 rounded-lg border-2 border-border bg-background p-4 text-left text-base transition-colors hover:border-accent/50"
          >
            <span className="min-w-0 flex-1">{item.label}</span>
          </button>
        ))}
      </div>

      {picked.length > 0 ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {yourAnswerLabel}
            </p>
            <Button size="sm" variant="ghost" onClick={() => onChange([])}>
              <RotateCcw className="h-3.5 w-3.5" /> {resetLabel}
            </Button>
          </div>
          <ol className="space-y-1.5">
            {picked.map((tag, pos) => (
              <li
                key={tag}
                className="flex items-center gap-3 rounded-md border bg-background p-3"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold">
                  {pos + 1}
                </span>
                <span className="min-w-0 flex-1">{byTag.get(tag) ?? "?"}</span>
                <button
                  type="button"
                  onClick={() => onChange(picked.filter((p) => p !== tag))}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
