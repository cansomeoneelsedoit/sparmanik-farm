/**
 * Dependency-free SVG line chart: HST on X, a metric on Y, one line per cycle.
 * Server-renderable. Points are (x, y); series carry their own colour. Built
 * for "what should this variety look like on day N" comparisons.
 */
export type GrowthSeries = {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  points: { x: number; y: number; n?: number }[];
};

export function GrowthChart({
  series,
  yLabel,
  xLabel = "HST (days after transplant)",
  markX,
  height = 280,
}: {
  series: GrowthSeries[];
  yLabel: string;
  xLabel?: string;
  /** Vertical marker (e.g. today's HST on the live cycle). */
  markX?: number | null;
  height?: number;
}) {
  const W = 720;
  const H = height;
  const pad = { l: 46, r: 16, t: 14, b: 38 };
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No measurements yet for this metric.</div>;
  }
  const xMax = Math.max(10, ...all.map((p) => p.x), markX ?? 0);
  const yMaxRaw = Math.max(...all.map((p) => p.y));
  const yMax = niceMax(yMaxRaw);
  const xs = (x: number) => pad.l + (x / xMax) * (W - pad.l - pad.r);
  const ys = (y: number) => H - pad.b - (y / yMax) * (H - pad.t - pad.b);
  const yTicks = ticks(yMax, 5);
  const xTicks = ticks(xMax, Math.min(10, xMax));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[520px] text-foreground" role="img" aria-label={`${yLabel} by HST`}>
        {/* grid */}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={pad.l} x2={W - pad.r} y1={ys(t)} y2={ys(t)} stroke="currentColor" strokeOpacity={0.08} />
            <text x={pad.l - 6} y={ys(t) + 3} fontSize={10} textAnchor="end" fill="currentColor" fillOpacity={0.6}>
              {fmt(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={xs(t)} x2={xs(t)} y1={pad.t} y2={H - pad.b} stroke="currentColor" strokeOpacity={0.05} />
            <text x={xs(t)} y={H - pad.b + 14} fontSize={10} textAnchor="middle" fill="currentColor" fillOpacity={0.6}>
              {t}
            </text>
          </g>
        ))}
        {/* axes */}
        <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} stroke="currentColor" strokeOpacity={0.3} />
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="currentColor" strokeOpacity={0.3} />
        <text x={pad.l + (W - pad.l - pad.r) / 2} y={H - 6} fontSize={10} textAnchor="middle" fill="currentColor" fillOpacity={0.6}>
          {xLabel}
        </text>
        <text x={12} y={pad.t + (H - pad.t - pad.b) / 2} fontSize={10} textAnchor="middle" fill="currentColor" fillOpacity={0.6} transform={`rotate(-90 12 ${pad.t + (H - pad.t - pad.b) / 2})`}>
          {yLabel}
        </text>
        {/* today marker */}
        {markX != null ? (
          <g>
            <line x1={xs(markX)} x2={xs(markX)} y1={pad.t} y2={H - pad.b} stroke="#f59e0b" strokeDasharray="4 3" />
            <text x={xs(markX) + 4} y={pad.t + 10} fontSize={10} fill="#b45309">
              today HST {markX}
            </text>
          </g>
        ) : null}
        {/* series */}
        {series.map((s) => {
          const pts = [...s.points].sort((a, b) => a.x - b.x);
          const d = pts.map((p, i) => `${i ? "L" : "M"}${xs(p.x).toFixed(1)},${ys(p.y).toFixed(1)}`).join(" ");
          return (
            <g key={s.key}>
              {pts.length > 1 ? (
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "6 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
              ) : null}
              {pts.map((p) => (
                <g key={`${s.key}-${p.x}`}>
                  <circle cx={xs(p.x)} cy={ys(p.y)} r={3.5} fill={s.color} stroke="white" strokeWidth={1} />
                  <title>{`${s.label} · HST ${p.x}: ${fmt(p.y)}${p.n && p.n > 1 ? ` (median of ${p.n})` : ""}`}</title>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 pt-1 text-xs">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5" style={{ background: s.color, borderTop: s.dashed ? `2px dashed ${s.color}` : undefined, height: s.dashed ? 0 : undefined }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  const n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return n * p;
}
function ticks(max: number, count: number): number[] {
  const step = max / count;
  const out: number[] = [];
  for (let i = 0; i <= count; i++) out.push(+(i * step).toFixed(2));
  return out;
}
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
