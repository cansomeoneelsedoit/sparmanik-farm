"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Three lightweight inline SVG charts for /sales (and the dashboard).
 * Built without a chart lib because we only need three simple shapes and
 * the bundle weight saving matters more than animation polish here:
 *
 * 1. **Revenue over time** — area chart over the last 30 days.
 * 2. **Revenue by greenhouse** — horizontal bar chart, top 6.
 * 3. **Revenue by produce** — horizontal bar chart, top 6.
 *
 * Important: this is a `"use client"` component, so it CANNOT import the
 * server-side <Money> component (which pulls Prisma in to read the live
 * exchange rate). Callers must pre-format any value they want displayed
 * via the `…Formatted` companion fields. The raw numeric `value` is still
 * needed for the bar math.
 */
export type Point = { date: string; revenue: string; revenueFormatted?: string };
export type Bar = { label: string; value: string; valueFormatted: string };

export function SalesCharts({
  trend,
  byGreenhouse,
  byProduce,
}: {
  trend: Point[];
  byGreenhouse: Bar[];
  byProduce: Bar[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-base">Revenue · last 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart trend={trend} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top greenhouses</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart rows={byGreenhouse.slice(0, 6)} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Top produces</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart rows={byProduce.slice(0, 6)} />
        </CardContent>
      </Card>
    </div>
  );
}

function TrendChart({ trend }: { trend: Point[] }) {
  const { points, max, maxFormatted } = useMemo(() => {
    if (trend.length === 0) {
      return { points: [], max: 0, maxFormatted: "—" };
    }
    let maxV = 0;
    let maxFmt = "—";
    for (const p of trend) {
      const v = Number(p.revenue);
      if (v > maxV) {
        maxV = v;
        maxFmt = p.revenueFormatted ?? p.revenue;
      }
    }
    return {
      points: trend.map((p, i) => ({
        x: trend.length === 1 ? 0 : (i / (trend.length - 1)) * 100,
        y: maxV === 0 ? 100 : 100 - (Number(p.revenue) / maxV) * 100,
        raw: p,
      })),
      max: maxV,
      maxFormatted: maxFmt,
    };
  }, [trend]);

  if (points.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No sales in window
      </div>
    );
  }

  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");
  const areaPath = `${linePath} L 100 100 L 0 100 Z`;
  const first = trend[0]?.date;
  const last = trend[trend.length - 1]?.date;

  return (
    <div className="space-y-1">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-32 w-full">
        <defs>
          <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(34 197 94)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(34 197 94)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#salesGradient)" />
        <path
          d={linePath}
          fill="none"
          stroke="rgb(34 197 94)"
          strokeWidth="0.6"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{first}</span>
        <span>Peak day: {max > 0 ? maxFormatted : "—"}</span>
        <span>{last}</span>
      </div>
    </div>
  );
}

function BarChart({ rows }: { rows: Bar[] }) {
  const max = useMemo(
    () => rows.reduce((m, r) => Math.max(m, Number(r.value)), 0),
    [rows],
  );
  if (rows.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No data
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const pct = max > 0 ? (Number(r.value) / max) * 100 : 0;
        return (
          <li key={r.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate font-medium">{r.label}</span>
              <span className="text-muted-foreground">{r.valueFormatted}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500/80"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
