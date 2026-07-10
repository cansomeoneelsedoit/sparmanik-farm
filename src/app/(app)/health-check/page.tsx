import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  ListChecks,
  ChevronRight,
} from "lucide-react";

import { computeHealthScore, runHealthChecks } from "@/server/health-checks";
import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthCheckCard } from "@/app/(app)/health-check/check-card";
import { TranslateNamesCard } from "@/app/(app)/health-check/translate-names-card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HealthCheckPage() {
  const checks = await runHealthChecks();
  const { score, cleanCount, totalCount } = computeHealthScore(checks);
  // English-name backfill card (superuser only — the action spends AI credits).
  const session = await auth();
  const isSuperuser = (session?.user as { role?: string } | undefined)?.role === "SUPERUSER";
  const missingNameEn = isSuperuser ? await prisma.item.count({ where: { nameEn: null } }) : 0;

  // Separate clean from dirty so the page leads with what needs attention.
  const issues = checks.filter((c) => !c.clean);
  const clean = checks.filter((c) => c.clean);

  // Group by severity for visual prioritisation.
  const critical = issues.filter((c) => c.severity === "critical");
  const warn = issues.filter((c) => c.severity === "warn");
  const info = issues.filter((c) => c.severity === "info");

  const ringColor =
    score >= 90
      ? "ring-emerald-500/40"
      : score >= 60
        ? "ring-amber-500/40"
        : "ring-rose-500/40";
  const dotColor =
    score >= 90
      ? "text-emerald-600 dark:text-emerald-400"
      : score >= 60
        ? "text-amber-600 dark:text-amber-400"
        : "text-rose-600 dark:text-rose-400";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Farm data health</h1>
          <p className="text-sm text-muted-foreground">
            Guided cleanup. AI suggests fixes for each issue; you click Apply or Skip per item.
          </p>
        </div>
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl border bg-card px-4 py-3 ring-2",
            ringColor,
          )}
        >
          <div className={cn("text-3xl font-semibold tabular-nums", dotColor)}>
            {score}%
          </div>
          <div className="text-xs text-muted-foreground">
            <div className="font-medium text-foreground">Health score</div>
            <div>
              {cleanCount}/{totalCount} checks clean
            </div>
          </div>
        </div>
      </header>

      {/* Stock-take entry point — surfaced at the top because it's the
          single most common "fix prod data" lever the user has. */}
      <Link
        href="/health-check/stocktake"
        className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/30 hover:bg-muted/40"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent-foreground">
          <ListChecks className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Stock-take</div>
          <div className="text-xs text-muted-foreground">
            Walk the warehouse with this page open. Set pack sizes
            (polybag-50pc, 500m roll, 500-seed bag) and fix actual on-hand
            stock per item — useful when stock got bought or used without
            being logged.
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>

      {/* One-click AI backfill of English item names (EN display). */}
      {missingNameEn > 0 ? <TranslateNamesCard missing={missingNameEn} /> : null}

      {/* Critical */}
      {critical.length > 0 ? (
        <SeveritySection
          title="Needs action"
          icon={<AlertOctagon className="h-4 w-4 text-rose-600" />}
          tone="critical"
        >
          {critical.map((c) => (
            <HealthCheckCard key={c.id} check={c} />
          ))}
        </SeveritySection>
      ) : null}

      {/* Warnings */}
      {warn.length > 0 ? (
        <SeveritySection
          title="Worth fixing"
          icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
          tone="warn"
        >
          {warn.map((c) => (
            <HealthCheckCard key={c.id} check={c} />
          ))}
        </SeveritySection>
      ) : null}

      {/* Info */}
      {info.length > 0 ? (
        <SeveritySection
          title="Nice to have"
          icon={<Info className="h-4 w-4 text-sky-600" />}
          tone="info"
        >
          {info.map((c) => (
            <HealthCheckCard key={c.id} check={c} />
          ))}
        </SeveritySection>
      ) : null}

      {/* Clean checks rolled up into one card so they don't dominate the page */}
      {clean.length > 0 ? (
        <Card className="border-emerald-300/50 bg-emerald-50/30 dark:bg-emerald-950/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              All clear ({clean.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
              {clean.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  <span>{c.title}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {issues.length === 0 ? (
        <Card className="border-emerald-400/60 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="p-10 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
            <h2 className="font-serif text-2xl">100% — nothing to clean up</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              All checks pass. Run again any time after a bulk import or a busy week.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function SeveritySection({
  title,
  icon,
  tone,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "critical" | "warn" | "info";
  children: React.ReactNode;
}) {
  const tones = {
    critical: "text-rose-700 dark:text-rose-300",
    warn: "text-amber-700 dark:text-amber-300",
    info: "text-sky-700 dark:text-sky-300",
  };
  return (
    <section className="space-y-3">
      <h2 className={cn("flex items-center gap-2 text-sm font-semibold uppercase tracking-wider", tones[tone])}>
        {icon}
        {title}
      </h2>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}
