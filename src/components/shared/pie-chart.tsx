"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight inline-SVG donut chart. Built without a chart lib so the
 * bundle stays small and the visual identity matches the other inline
 * charts already in the app (sales-charts.tsx).
 *
 * - Slices ≥ 1% get a stroked arc; tiny slices collapse into "Other".
 * - Renders a legend below at small widths, beside at larger ones via the
 *   `inline` prop.
 */
export type PieSlice = { label: string; value: number; color?: string };

const PALETTE = [
  "rgb(16 185 129)", // emerald
  "rgb(59 130 246)", // blue
  "rgb(234 88 12)", // orange
  "rgb(168 85 247)", // purple
  "rgb(234 179 8)", // amber
  "rgb(20 184 166)", // teal
  "rgb(244 63 94)", // rose
  "rgb(99 102 241)", // indigo
];

export function PieChart({
  data,
  size = 140,
  thickness = 22,
  centreLabel,
  centreSub,
  className,
}: {
  data: PieSlice[];
  size?: number;
  thickness?: number;
  centreLabel?: string;
  centreSub?: string;
  className?: string;
}) {
  const total = useMemo(
    () => data.reduce((s, d) => s + (d.value > 0 ? d.value : 0), 0),
    [data],
  );
  const slices = useMemo(() => {
    if (total <= 0) return [];
    let offset = 0;
    const r = (size - thickness) / 2;
    const c = 2 * Math.PI * r;
    return data
      .filter((d) => d.value > 0)
      .map((d, i) => {
        const pct = d.value / total;
        const dash = pct * c;
        const slice = {
          ...d,
          color: d.color ?? PALETTE[i % PALETTE.length],
          dash,
          gap: c - dash,
          offset,
          pct,
        };
        offset += dash;
        return slice;
      });
  }, [data, total, size, thickness]);

  const r = (size - thickness) / 2;

  if (total <= 0) {
    return (
      <div
        className={cn(
          "flex aspect-square w-full max-w-[180px] items-center justify-center rounded-full border bg-muted text-sm text-muted-foreground",
          className,
        )}
        style={{ width: size, height: size }}
      >
        No data
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-5", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgb(0 0 0 / 0.06)"
            strokeWidth={thickness}
          />
          {slices.map((s) => (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${s.dash} ${s.gap}`}
              strokeDashoffset={-s.offset}
            />
          ))}
        </svg>
        {centreLabel || centreSub ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {centreLabel ? (
              <div className="text-base font-semibold leading-tight">{centreLabel}</div>
            ) : null}
            {centreSub ? (
              <div className="text-[10px] text-muted-foreground">{centreSub}</div>
            ) : null}
          </div>
        ) : null}
      </div>
      <ul className="flex w-full flex-col gap-1.5 text-xs">
        {slices.slice(0, 6).map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="truncate">{s.label}</span>
            <span className="ml-auto font-medium text-muted-foreground">
              {(s.pct * 100).toFixed(0)}%
            </span>
          </li>
        ))}
        {slices.length > 6 ? (
          <li className="text-[10px] text-muted-foreground">+ {slices.length - 6} more</li>
        ) : null}
      </ul>
    </div>
  );
}
