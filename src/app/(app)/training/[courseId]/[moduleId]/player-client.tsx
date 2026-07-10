"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  ExternalLink,
  RotateCcw,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { submitModuleAttempt } from "@/app/(app)/training/actions";

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

function ModuleVideo({ video }: { video: PlayerVideo }) {
  const platform =
    video.type === "UPLOAD" ? "upload" : video.url ? detectUrlPlatform(video.url) : "unknown";
  const ytId = video.url && platform === "youtube" ? parseYoutubeId(video.url) : null;
  const ttId = video.url && platform === "tiktok" ? parseTiktokId(video.url) : null;
  const igCode = video.url && platform === "instagram" ? parseInstagramCode(video.url) : null;

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-sm">
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
// Result-screen dressing — score ring + a one-shot CSS confetti burst.
// ---------------------------------------------------------------------------

/** Animated SVG score ring: the arc sweeps in on mount via a CSS transition
 *  on stroke-dashoffset. Emerald when passed, warm amber when not. */
function ScoreRing({ score, passed, label }: { score: number; passed: boolean; label: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx={60} cy={60} r={r} fill="none" strokeWidth={10} className="stroke-muted" />
        <circle
          cx={60}
          cy={60}
          r={r}
          fill="none"
          strokeWidth={10}
          strokeLinecap="round"
          className={passed ? "stroke-emerald-500" : "stroke-amber-500"}
          strokeDasharray={c}
          strokeDashoffset={armed ? offset : c}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold tabular-nums">{score}%</span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}

/** Tasteful pure-CSS confetti: a handful of deterministic pieces (no
 *  Math.random — stable markup) fall and fade once over the result card. */
const CONFETTI_COLORS = ["#f59e0b", "#10b981", "#f97316", "#3b82f6", "#ec4899", "#a855f7"];

function ConfettiBurst() {
  const pieces = Array.from({ length: 16 }, (_, i) => ({
    left: `${(i * 6.3 + 3) % 100}%`,
    delay: `${(i % 5) * 0.15}s`,
    duration: `${1.6 + (i % 4) * 0.35}s`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    round: i % 3 === 0,
  }));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes training-confetti-fall {
          0% { transform: translateY(-16px) rotate(0deg); opacity: 1; }
          70% { opacity: 1; }
          100% { transform: translateY(340px) rotate(300deg); opacity: 0; }
        }
      `}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          className={cn("absolute top-0 block", p.round ? "h-2 w-2 rounded-full" : "h-3 w-1.5 rounded-sm")}
          style={{
            left: p.left,
            backgroundColor: p.color,
            opacity: 0,
            animation: `training-confetti-fall ${p.duration} ease-in ${p.delay} forwards`,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player — content first, then questions one at a time, then the result.
// ---------------------------------------------------------------------------

export function PlayerClient({
  courseId,
  moduleId,
  courseHref,
  nextModuleHref,
  passPct,
  video,
  hasImage,
  body,
  questions,
}: {
  /** The course this module is being played inside — attempts are marked
   *  against the {courseId, moduleId} pair on the server. */
  courseId: string;
  moduleId: string;
  courseHref: string;
  nextModuleHref: string | null;
  passPct: number;
  video: PlayerVideo | null;
  hasImage: boolean;
  /** Module body already localized server-side. */
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
      const res = await submitModuleAttempt({ courseId, moduleId, answers });
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
        {video ? <ModuleVideo video={video} /> : null}
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/training/image/module/${moduleId}`}
            alt=""
            className="w-full rounded-xl border object-contain shadow-sm"
          />
        ) : null}
        {body ? (
          <Card>
            <CardContent className="space-y-4 p-6 text-base leading-relaxed">
              {body.split(/\n+/).map((para, i) =>
                para.trim() ? <p key={i}>{para}</p> : null,
              )}
            </CardContent>
          </Card>
        ) : null}

        {questions.length === 0 ? (
          /* Content-only module: no quiz, so completing = viewing. Submitting
             the empty attempt records a 100% pass server-side and unlocks the
             next module (otherwise this module could never pass and would
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
      <div className="space-y-5">
        <Card className="relative overflow-hidden">
          {result.passed ? <ConfettiBurst /> : null}
          <CardContent className="relative flex flex-col items-center gap-4 p-8 text-center">
            <ScoreRing score={result.score} passed={result.passed} label={t("yourScore")} />
            <div className="space-y-1.5">
              <h2 className="font-serif text-3xl">
                {result.passed ? t("passedTitle") : t("failedTitle")}
              </h2>
              {!result.passed ? (
                <>
                  <p className="text-sm text-muted-foreground">{t("failedEncourage")}</p>
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                    {t("needScore", { score: passPct })}
                  </p>
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <h3 className="font-serif text-xl">{t("reviewAnswers")}</h3>
          {questions.map((q, i) => {
            const ok = result.perQuestion[q.id] === true;
            const given = formatAnswer(q);
            return (
              <Card
                key={q.id}
                className={cn(
                  "border-l-4",
                  ok ? "border-l-emerald-500" : "border-l-amber-500",
                )}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <span
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      ok
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
                    )}
                  >
                    {ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug">
                      {i + 1}. {q.prompt}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("yourAnswer")}: {given === "" ? t("noAnswer") : given}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-xs font-semibold uppercase tracking-wide",
                      ok
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400",
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
              {nextModuleHref ? (
                <Button asChild size="lg" className="h-14 flex-1 text-base">
                  <Link href={nextModuleHref}>
                    {t("nextModule")} <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
              <Button
                asChild
                size="lg"
                variant={nextModuleHref ? "outline" : "default"}
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
      {/* Step dots: done = filled, current = elongated pill, ahead = muted. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {questions.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-2.5 rounded-full transition-all duration-300",
                i < qIndex
                  ? "w-2.5 bg-accent"
                  : i === qIndex
                    ? "w-6 bg-accent shadow-sm"
                    : "w-2.5 bg-muted-foreground/25",
              )}
            />
          ))}
        </div>
        <p className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
          {t("stepOf", { n: qIndex + 1, total: questions.length })}
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="space-y-5 p-6">
          <p className="font-serif text-2xl leading-snug">{q.prompt}</p>
          {q.hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/training/image/question/${q.id}`}
              alt=""
              className="w-full rounded-xl border object-contain"
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
              className="h-14 rounded-xl text-lg"
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

/** Letter used on option/order tiles — A, B, C… (wraps after Z, which no sane
 *  quiz will ever reach). */
function tileLetter(i: number): string {
  return String.fromCharCode(65 + (i % 26));
}

/** Tappable multi-select option tiles (multiple choice + photo spot) with
 *  A/B/C/D letter badges and a clear selected state. */
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
              "group flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left text-base transition-all",
              on
                ? "border-accent bg-accent/10 font-medium shadow-sm"
                : "border-border bg-background hover:border-accent/40 hover:bg-muted/40",
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-semibold transition-colors",
                on
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-muted-foreground/30 text-muted-foreground group-hover:border-accent/50",
              )}
            >
              {tileLetter(i)}
            </span>
            <span className="min-w-0 flex-1">{label}</span>
            {on ? <Check className="h-5 w-5 shrink-0 text-accent" /> : null}
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
            className="group flex w-full items-center gap-3 rounded-xl border-2 border-border bg-background p-4 text-left text-base transition-all hover:border-accent/40 hover:bg-muted/40"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-muted-foreground/30 text-sm font-semibold text-muted-foreground transition-colors group-hover:border-accent/50">
              {tileLetter(item.tag)}
            </span>
            <span className="min-w-0 flex-1">{item.label}</span>
          </button>
        ))}
      </div>

      {picked.length > 0 ? (
        <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
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
                className="flex items-center gap-3 rounded-lg border bg-background p-3 shadow-sm transition-all"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  {pos + 1}
                </span>
                <span className="min-w-0 flex-1">{byTag.get(tag) ?? "?"}</span>
                <button
                  type="button"
                  onClick={() => onChange(picked.filter((p) => p !== tag))}
                  className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
