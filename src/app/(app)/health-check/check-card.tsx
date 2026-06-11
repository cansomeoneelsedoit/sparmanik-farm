"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Sparkles, Check, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { applyFix, suggestFixes, type AiSuggestion } from "@/app/(app)/health-check/actions";
import type {
  HealthCheckResult,
  HealthIssueItem,
} from "@/server/health-checks";

type SuggestionState = {
  pending: Set<string>; // itemIds still waiting on AI
  byItem: Map<string, AiSuggestion>;
  rejected: Set<string>; // user-skipped — keep around so retry button is enabled
};

/**
 * Expandable card per check. Shows the affected item list, a "Get AI
 * suggestions" button (only when `fixWith` is non-null), and per-row
 * Apply / Skip actions once suggestions land.
 */
export function HealthCheckCard({ check }: { check: HealthCheckResult }) {
  const router = useRouter();
  const [open, setOpen] = useState(check.severity === "critical");
  const [pending, startT] = useTransition();
  const [askingAi, setAskingAi] = useState(false);
  const [state, setState] = useState<SuggestionState>({
    pending: new Set(),
    byItem: new Map(),
    rejected: new Set(),
  });

  const severityTone =
    check.severity === "critical"
      ? "border-rose-300 bg-rose-50/30 dark:border-rose-900/50 dark:bg-rose-950/10"
      : check.severity === "warn"
        ? "border-amber-300 bg-amber-50/30 dark:border-amber-900/50 dark:bg-amber-950/10"
        : "border-sky-300 bg-sky-50/30 dark:border-sky-900/50 dark:bg-sky-950/10";

  async function handleSuggest() {
    if (!check.fixWith) return;
    setAskingAi(true);
    const ids = check.items.map((i) => i.id);
    try {
      const r = await suggestFixes({ checkId: check.id, field: check.fixWith, itemIds: ids });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const next = new Map(state.byItem);
      for (const s of r.data?.suggestions ?? []) {
        next.set(s.itemId, s);
      }
      setState((p) => ({ ...p, byItem: next }));
      const got = r.data?.suggestions.length ?? 0;
      toast.success(`AI returned ${got} suggestion${got === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setAskingAi(false);
    }
  }

  function handleApply(item: HealthIssueItem) {
    const suggestion = state.byItem.get(item.id);
    if (!suggestion) return;
    setState((p) => {
      const pending = new Set(p.pending);
      pending.add(item.id);
      return { ...p, pending };
    });
    startT(async () => {
      const r = await applyFix({
        itemId: item.id,
        field: suggestion.field,
        value: suggestion.value,
      });
      setState((p) => {
        const pending = new Set(p.pending);
        pending.delete(item.id);
        const byItem = new Map(p.byItem);
        if (r.ok) byItem.delete(item.id);
        return { ...p, pending, byItem };
      });
      if (r.ok) {
        toast.success(`Applied to ${item.label}`);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function handleSkip(item: HealthIssueItem) {
    setState((p) => {
      const byItem = new Map(p.byItem);
      byItem.delete(item.id);
      const rejected = new Set(p.rejected);
      rejected.add(item.id);
      return { ...p, byItem, rejected };
    });
  }

  const suggestionsCount = state.byItem.size;

  return (
    <Card className={cn("transition", severityTone)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left"
        aria-expanded={open}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {check.title}
              <Badge variant={check.severity === "critical" ? "destructive" : "secondary"}>
                {check.count}
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">{check.description}</p>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </CardHeader>
      </button>

      {open ? (
        <CardContent className="space-y-3">
          {/* Bulk-fix deep link (e.g. stock-take wizard pre-filtered) */}
          {check.actionHref && check.count > 0 ? (
            <Button asChild size="sm" variant="default">
              <Link href={check.actionHref}>
                {check.actionLabel ?? "Fix these"}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : null}

          {/* Get AI suggestions */}
          {check.fixWith ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                onClick={handleSuggest}
                disabled={askingAi || pending}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {askingAi
                  ? "Asking AI…"
                  : suggestionsCount > 0
                    ? `Re-suggest (${suggestionsCount} pending)`
                    : `Get AI suggestions (top ${check.items.length})`}
              </Button>
              <p className="text-[10px] text-muted-foreground">
                Sends item names + descriptions to the AI chain. Receives a
                draft <code className="rounded bg-muted px-1">{check.fixWith}</code>{" "}
                per item. You click Apply or Skip per row.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              These don&apos;t have an AI-fixable field — click into each row to
              edit by hand.
            </p>
          )}

          {/* Items */}
          <ul className="divide-y rounded-md border bg-background">
            {check.items.map((it) => {
              const suggestion = state.byItem.get(it.id);
              const isPending = state.pending.has(it.id);
              return (
                <li
                  key={it.id}
                  className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{it.label}</span>
                      {it.href ? (
                        <Link
                          href={it.href}
                          className="text-muted-foreground hover:text-foreground"
                          title="Open"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : null}
                    </div>
                    {it.detail ? (
                      <div className="line-clamp-1 text-xs text-muted-foreground">
                        {it.detail}
                      </div>
                    ) : null}
                    {suggestion ? (
                      <div className="mt-1 rounded-md bg-muted/60 px-2 py-1.5 text-xs">
                        <div>
                          <span className="text-muted-foreground">Suggested {suggestion.field}: </span>
                          <strong className="text-foreground">{suggestion.value}</strong>
                        </div>
                        {suggestion.reason ? (
                          <div className="text-[10px] text-muted-foreground">
                            {suggestion.reason}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {suggestion ? (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleApply(it)}
                        disabled={isPending}
                      >
                        <Check className="h-3.5 w-3.5" />
                        {isPending ? "Applying…" : "Apply"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSkip(it)}
                        disabled={isPending}
                      >
                        <X className="h-3.5 w-3.5" />
                        Skip
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
            {check.count > check.items.length ? (
              <li className="bg-muted/30 p-3 text-center text-xs text-muted-foreground">
                + {check.count - check.items.length} more (showing first {check.items.length})
              </li>
            ) : null}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}
