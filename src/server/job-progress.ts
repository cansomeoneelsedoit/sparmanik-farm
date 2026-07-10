/**
 * Lightweight progress store for long-running server actions (AI watching a
 * YouTube video, drafting quizzes, bulk translations…). The action updates its
 * job as it moves through REAL stages; the client polls and renders a status
 * bar instead of an anonymous spinner (Boyd's request).
 *
 * In-memory by design: jobs live minutes and the app runs as a single
 * instance (one Railway service / one local container). Entries expire after
 * 15 minutes so abandoned jobs don't leak.
 */

export type JobProgress = {
  /** Machine stage key — the client maps it to a localized caption. */
  stage: string;
  /** Optional human detail, e.g. "module 3 of 6". */
  detail?: string;
  /** 0–100. Stages without true sub-progress sit at their floor value. */
  pct: number;
  done: boolean;
  error?: string;
  startedAt: number;
  updatedAt: number;
};

const jobs = new Map<string, JobProgress>();
const TTL_MS = 15 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (now - j.updatedAt > TTL_MS) jobs.delete(id);
  }
}

export function setJobProgress(
  id: string,
  update: { stage: string; detail?: string; pct: number; done?: boolean; error?: string },
): void {
  if (!id) return;
  sweep();
  const existing = jobs.get(id);
  jobs.set(id, {
    stage: update.stage,
    detail: update.detail,
    pct: Math.max(0, Math.min(100, Math.round(update.pct))),
    done: update.done ?? false,
    error: update.error,
    startedAt: existing?.startedAt ?? Date.now(),
    updatedAt: Date.now(),
  });
}

export function getJobProgress(id: string): JobProgress | null {
  sweep();
  return jobs.get(id) ?? null;
}

export function clearJobProgress(id: string): void {
  jobs.delete(id);
}
