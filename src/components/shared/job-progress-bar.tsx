"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type JobProgress = { stage: string; detail?: string; pct: number };

/**
 * Live status bar for long-running server jobs (AI watching a video, building
 * a course…). Polls the job-progress store every 2s while `active`, shows the
 * stage caption, a real percentage bar, the server-reported detail ("module 3
 * of 6") and an elapsed-time counter — so a two-minute AI job never looks
 * frozen (Boyd: "not just a spinning wheel").
 *
 * The poll goes through a GET Route Handler (/api/jobs/<id>/progress) via plain
 * fetch, NOT a server action: Next.js serializes server actions, so while the
 * job's own action is in flight a server-action poll would queue behind it and
 * the bar would never move until the job finished — defeating the whole point.
 *
 * `stages` maps machine stage keys to human captions (pass localized strings).
 */
type JobProgressBarProps = {
  jobId: string | null;
  active: boolean;
  stages: Record<string, string>;
  className?: string;
};

export function JobProgressBar(props: JobProgressBarProps) {
  // Key on the job id: a new job remounts the inner component, so every
  // piece of state (elapsed, pct, stage) starts fresh without any
  // setState-in-effect reset dance.
  return <JobProgressBarInner key={props.jobId ?? "idle"} {...props} />;
}

function JobProgressBarInner({ jobId, active, stages, className }: JobProgressBarProps) {
  const [stage, setStage] = useState<string>("");
  const [detail, setDetail] = useState<string | undefined>(undefined);
  const [pct, setPct] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  // Elapsed-seconds ticker (client-side, smooth even between polls).
  useEffect(() => {
    if (!active) return;
    if (startRef.current === null) startRef.current = Date.now();
    const start = startRef.current;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [active]);

  // Server progress poll.
  useEffect(() => {
    if (!active || !jobId) return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/progress`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const p = (await res.json()) as JobProgress | null;
        if (stopped || !p) return;
        setStage(p.stage);
        setDetail(p.detail);
        setPct(p.pct);
      } catch {
        /* transient poll failure — keep the last state */
      }
    };
    void poll();
    const t = setInterval(poll, 2000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [active, jobId]);

  if (!active) return null;

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const elapsedLabel = mins > 0 ? `${mins}m ${secs.toString().padStart(2, "0")}s` : `${secs}s`;
  const caption = stages[stage] ?? stages["_default"] ?? "Working…";

  return (
    <div className={cn("space-y-2 rounded-md border bg-muted/30 p-3", className)}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium">
          {caption}
          {detail ? <span className="font-normal text-muted-foreground"> — {detail}</span> : null}
        </span>
        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{elapsedLabel}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full bg-accent transition-all duration-700",
            // Gentle pulse while a stage has no sub-progress, so the bar always
            // visibly breathes even when the percentage holds still.
            pct > 0 && pct < 100 && "animate-pulse",
          )}
          style={{ width: `${Math.max(pct, 3)}%` }}
        />
      </div>
    </div>
  );
}
