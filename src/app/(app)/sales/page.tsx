import Link from "next/link";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money } from "@/components/shared/money";
import { SalesFilters } from "@/app/(app)/sales/sales-filters";
import { SalesCharts } from "@/app/(app)/sales/sales-charts";

export const dynamic = "force-dynamic";

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; gh?: string; hv?: string; from?: string; to?: string }>;
}) {
  const { q = "", gh = "", hv = "", from = "", to = "" } = await searchParams;

  // Build Prisma filter from URL state.
  const where = {
    AND: [
      hv ? { harvestId: hv } : {},
      gh ? { harvest: { greenhouseId: gh } } : {},
      from ? { date: { gte: new Date(from) } } : {},
      to ? { date: { lte: new Date(`${to}T23:59:59`) } } : {},
      // Search currently hits produce name and harvest name. Sale doesn't
      // have buyer/note columns in the schema; if/when those are added,
      // include them here.
      q
        ? {
            OR: [
              { produce: { name: { contains: q, mode: "insensitive" as const } } },
              { harvest: { name: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {},
    ],
  };

  const [sales, greenhouses, harvests] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        harvest: { select: { id: true, name: true, greenhouse: { select: { name: true } } } },
        produce: { select: { id: true, name: true } },
      },
    }),
    prisma.greenhouse.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.harvest.findMany({
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      select: { id: true, name: true, greenhouseId: true },
    }),
  ]);

  type SaleRow = {
    id: string;
    date: Date;
    grade: string;
    weight: Decimal;
    pricePerKg: Decimal;
    amount: Decimal;
    harvest: { id: string; name: string; greenhouse: { name: string } };
    produce: { id: string; name: string };
  };

  const rows = sales as SaleRow[];

  const totalRevenue = rows.reduce((s: Decimal, x) => s.plus(x.amount), new Decimal(0));
  const totalWeight = rows.reduce((s: Decimal, x) => s.plus(x.weight), new Decimal(0));
  const avgPrice = totalWeight.gt(0) ? totalRevenue.div(totalWeight) : new Decimal(0);

  type RollupRow = { name: string; revenue: Decimal; weight: Decimal };
  const byGreenhouse = new Map<string, RollupRow>();
  const byProduce = new Map<string, RollupRow>();
  for (const r of rows) {
    const gname = r.harvest.greenhouse.name;
    const pname = r.produce.name;
    const g = byGreenhouse.get(gname) ?? { name: gname, revenue: new Decimal(0), weight: new Decimal(0) };
    byGreenhouse.set(gname, { ...g, revenue: g.revenue.plus(r.amount), weight: g.weight.plus(r.weight) });
    const p = byProduce.get(pname) ?? { name: pname, revenue: new Decimal(0), weight: new Decimal(0) };
    byProduce.set(pname, { ...p, revenue: p.revenue.plus(r.amount), weight: p.weight.plus(r.weight) });
  }
  const greenhouseRollup = Array.from(byGreenhouse.values()).sort((a, b) => b.revenue.cmp(a.revenue));
  const produceRollup = Array.from(byProduce.values()).sort((a, b) => b.revenue.cmp(a.revenue));

  // 30-day rolling revenue series — group by date and fill empty days with
  // zeros so the line doesn't visually skip weekends. Ends at *today* even
  // when the filter window is narrower, so the user sees the recent shape.
  const TRENDS_WINDOW_DAYS = 30;
  const trendStart = new Date();
  trendStart.setUTCHours(0, 0, 0, 0);
  trendStart.setUTCDate(trendStart.getUTCDate() - (TRENDS_WINDOW_DAYS - 1));
  const dailyRevenue = new Map<string, Decimal>();
  for (const r of rows) {
    const day = r.date.toISOString().slice(0, 10);
    if (r.date < trendStart) continue;
    dailyRevenue.set(day, (dailyRevenue.get(day) ?? new Decimal(0)).plus(r.amount));
  }
  // Local IDR formatter — passed to the chart as already-formatted strings
  // so the chart (a "use client" component) doesn't need to import the
  // server-only <Money> component (which would pull Prisma into the
  // client bundle).
  const fmtIDR = (v: Decimal | number) =>
    `Rp ${Number(new Decimal(v).toFixed(0)).toLocaleString("id-ID")}`;

  const trend: { date: string; revenue: string; revenueFormatted: string }[] = [];
  for (let i = 0; i < TRENDS_WINDOW_DAYS; i += 1) {
    const d = new Date(trendStart);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    const rev = dailyRevenue.get(key) ?? new Decimal(0);
    trend.push({ date: key, revenue: rev.toFixed(4), revenueFormatted: fmtIDR(rev) });
  }

  const hasFilters = !!(q || gh || hv || from || to);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Sales</h1>
        <p className="text-sm text-muted-foreground">
          Every produce sale, grouped and filterable by greenhouse, harvest, and date.
        </p>
      </header>

      <SalesFilters greenhouses={greenhouses} harvests={harvests} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Records</div><div className="text-2xl font-semibold">{rows.length}</div>{hasFilters ? <div className="text-[10px] text-muted-foreground">filtered</div> : null}</CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total weight</div><div className="text-2xl font-semibold">{totalWeight.toFixed(2)} kg</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total revenue</div><div className="text-2xl font-semibold"><Money value={totalRevenue.toFixed(4)} /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Avg price / kg</div><div className="text-2xl font-semibold"><Money value={avgPrice.toFixed(4)} /></div></CardContent></Card>
      </div>

      <SalesCharts
        trend={trend}
        byGreenhouse={greenhouseRollup.map((g) => ({
          label: g.name,
          value: g.revenue.toFixed(4),
          valueFormatted: fmtIDR(g.revenue),
        }))}
        byProduce={produceRollup.map((p) => ({
          label: p.name,
          value: p.revenue.toFixed(4),
          valueFormatted: fmtIDR(p.revenue),
        }))}
      />

      {greenhouseRollup.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>By greenhouse</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Greenhouse</TableHead><TableHead className="text-right">Weight (kg)</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                <TableBody>
                  {greenhouseRollup.map((g) => (
                    <TableRow key={g.name}>
                      <TableCell className="font-medium">{g.name}</TableCell>
                      <TableCell className="text-right">{g.weight.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium"><Money value={g.revenue.toFixed(4)} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>By produce</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Produce</TableHead><TableHead className="text-right">Weight (kg)</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                <TableBody>
                  {produceRollup.map((p) => (
                    <TableRow key={p.name}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right">{p.weight.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium"><Money value={p.revenue.toFixed(4)} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader><CardTitle>{hasFilters ? "Filtered sales" : "All sales"}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              {hasFilters ? "No sales match your filters." : "No sales yet."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Greenhouse</TableHead>
                  <TableHead>Harvest</TableHead>
                  <TableHead>Produce</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Price/kg</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-muted-foreground">{s.date.toISOString().slice(0, 10)}</TableCell>
                    <TableCell className="text-muted-foreground">{s.harvest.greenhouse.name}</TableCell>
                    <TableCell>
                      <Link href={`/harvest/${s.harvest.id}`} className="hover:underline">{s.harvest.name}</Link>
                    </TableCell>
                    <TableCell>{s.produce.name}</TableCell>
                    <TableCell><Badge variant="outline">{s.grade}</Badge></TableCell>
                    <TableCell className="text-right">{Number(s.weight)} kg</TableCell>
                    <TableCell className="text-right"><Money value={s.pricePerKg.toFixed(4)} /></TableCell>
                    <TableCell className="text-right font-medium"><Money value={s.amount.toFixed(4)} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
