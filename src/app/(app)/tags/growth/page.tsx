import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GrowthChart, type GrowthSeries } from "@/components/shared/growth-chart";
import { todayWIB } from "@/lib/date";

export const dynamic = "force-dynamic";

const METRICS = [
  { key: "heightCm", label: "Height (cm)" },
  { key: "leafCount", label: "Leaves" },
  { key: "stemMm", label: "Stem Ø (mm)" },
  { key: "fruitCm", label: "Fruit Ø (cm)" },
  { key: "fruitG", label: "Fruit weight (g)" },
  { key: "brix", label: "Brix" },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

const PALETTE = ["#059669", "#2563eb", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#4b5563"];

/**
 * Growth chart per variety: every measurement of that variety, grouped by
 * cycle (harvest), median per HST, so this crop can be read against the last
 * ones day-for-day. Live cycle solid, past cycles dashed, today marked.
 */
export default async function GrowthPage({
  searchParams,
}: {
  searchParams: Promise<{ produce?: string; metric?: string }>;
}) {
  const sp = await searchParams;
  const metric = (METRICS.find((m) => m.key === sp.metric)?.key ?? "heightCm") as MetricKey;

  const produces = (await prisma.produce.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })) as { id: string; name: string }[];
  const produceId = sp.produce && produces.some((p) => p.id === sp.produce) ? sp.produce : produces[0]?.id;
  const produce = produces.find((p) => p.id === produceId) ?? null;

  type Row = {
    hst: number | null;
    date: Date;
    heightCm: unknown; leafCount: number | null; stemMm: unknown; fruitCm: unknown; fruitG: unknown; brix: unknown;
    record: { plantedAt: Date; harvest: { id: string; name: string; status: string; startDate: Date; transplantDate: Date | null; greenhouse: { name: string } } | null; tag: { label: string } };
  };
  const rows = produceId
    ? ((await prisma.plantMeasurement.findMany({
        where: { record: { produceId, tag: {} } },
        select: {
          hst: true, date: true, heightCm: true, leafCount: true, stemMm: true, fruitCm: true, fruitG: true, brix: true,
          record: { select: { plantedAt: true, harvest: { select: { id: true, name: true, status: true, startDate: true, transplantDate: true, greenhouse: { select: { name: true } } } }, tag: { select: { label: true } } } },
        },
      })) as Row[])
    : [];

  // Group by cycle → HST → values (median).
  const cycles = new Map<string, { label: string; live: boolean; start: number; byHst: Map<number, number[]> }>();
  for (const r of rows) {
    const v = r[metric as keyof Row];
    const num = v == null ? null : Number(v);
    if (num == null || !Number.isFinite(num)) continue;
    const hst = r.hst ?? Math.round((r.date.getTime() - r.record.plantedAt.getTime()) / 86_400_000);
    const key = r.record.harvest?.id ?? "no-cycle";
    const label = r.record.harvest ? `${r.record.harvest.name} · ${r.record.harvest.greenhouse.name} (${r.record.harvest.startDate.toISOString().slice(0, 7)})` : "No cycle";
    const c = cycles.get(key) ?? { label, live: r.record.harvest?.status === "LIVE", start: r.record.harvest?.startDate.getTime() ?? 0, byHst: new Map() };
    const arr = c.byHst.get(hst) ?? [];
    arr.push(num);
    c.byHst.set(hst, arr);
    cycles.set(key, c);
  }
  const ordered = [...cycles.entries()].sort((a, b) => b[1].start - a[1].start);
  const series: GrowthSeries[] = ordered.map(([key, c], i) => ({
    key,
    label: c.label + (c.live ? " — live" : ""),
    color: PALETTE[i % PALETTE.length],
    dashed: !c.live,
    points: [...c.byHst.entries()].map(([x, vals]) => ({ x, y: median(vals), n: vals.length })).sort((a, b) => a.x - b.x),
  }));

  // Today's HST on the live cycle of this variety (if any).
  const live = rows.find((r) => r.record.harvest?.status === "LIVE")?.record.harvest ?? null;
  const markX = live ? Math.round((Date.parse(todayWIB()) - (live.transplantDate ?? live.startDate).getTime()) / 86_400_000) : null;

  const totalPoints = rows.length;
  const metricLabel = METRICS.find((m) => m.key === metric)!.label;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" className="h-10 sm:h-9">
          <Link href="/tags"><ArrowLeft className="h-4 w-4" /> Tags</Link>
        </Button>
        <h1 className="font-serif text-2xl">Growth chart</h1>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span>Variety</span>
            <div className="flex flex-wrap gap-1.5">
              {produces.map((p) => (
                <Link key={p.id} href={`/tags/growth?produce=${p.id}&metric=${metric}`}>
                  <Badge variant={p.id === produceId ? "default" : "outline"} className="cursor-pointer">{p.name}</Badge>
                </Link>
              ))}
            </div>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
            <span className="text-muted-foreground">Metric:</span>
            {METRICS.map((m) => (
              <Link key={m.key} href={`/tags/growth?produce=${produceId}&metric=${m.key}`}>
                <Badge variant={m.key === metric ? "secondary" : "outline"} className="cursor-pointer">{m.label}</Badge>
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {produce ? (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                <strong className="text-foreground">{produce.name}</strong> — {metricLabel} by HST. Each point is the median of the plants
                measured that day; the live cycle is solid, earlier cycles dashed, so you can read what to expect on the same day next time.
                {totalPoints ? ` ${totalPoints} measurement${totalPoints === 1 ? "" : "s"} on record.` : ""}
              </p>
              <GrowthChart series={series} yLabel={metricLabel} markX={markX} />
              {series.length ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="border-b">
                        <th className="p-1.5 text-left">Cycle</th>
                        {series[0] ? <th className="p-1.5 text-left">HST → {metricLabel} (median · n)</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {series.map((s) => (
                        <tr key={s.key} className="border-b last:border-0 align-top">
                          <td className="whitespace-nowrap p-1.5 font-medium" style={{ color: s.color }}>{s.label}</td>
                          <td className="p-1.5 font-mono">{s.points.map((p) => `${p.x}→${Number.isInteger(p.y) ? p.y : p.y.toFixed(1)}${p.n && p.n > 1 ? `·${p.n}` : ""}`).join("   ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No varieties yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
