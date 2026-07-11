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
import { Money, MoneyDual } from "@/components/shared/money";
import { DownloadCsvButton } from "@/components/shared/download-csv-button";
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
    packagingCharge: Decimal;
    charity: boolean;
    harvest: { id: string; name: string; greenhouse: { name: string } };
    produce: { id: string; name: string };
  };

  const rows = sales as SaleRow[];
  // What was charged for the PRODUCE (excludes any on-top packaging charge) —
  // the figure discount stats compare against list, so a boxed sale isn't read
  // as a markup (app review #15). Revenue cards still use the full amount.
  const produceCharged = (x: SaleRow) => x.amount.minus(x.packagingCharge ?? new Decimal(0));

  const totalRevenue = rows.reduce((s: Decimal, x) => s.plus(x.amount), new Decimal(0));
  const totalWeight = rows.reduce((s: Decimal, x) => s.plus(x.weight), new Decimal(0));
  const avgPrice = totalWeight.gt(0) ? totalRevenue.div(totalWeight) : new Decimal(0);
  // Discount = list value (weight × price/kg) minus produce charged. Positive =
  // we charged below list. Net of any markups.
  const totalList = rows.reduce((s: Decimal, x) => s.plus(x.weight.times(x.pricePerKg)), new Decimal(0));
  const totalProduceCharged = rows.reduce((s: Decimal, x) => s.plus(produceCharged(x)), new Decimal(0));
  const totalDiscount = totalList.minus(totalProduceCharged);
  // Charity donations — a subset of the revenue above, called out separately.
  const charityRows = rows.filter((x) => x.charity);
  const charityRevenue = charityRows.reduce((s: Decimal, x) => s.plus(x.amount), new Decimal(0));
  const charityWeight = charityRows.reduce((s: Decimal, x) => s.plus(x.weight), new Decimal(0));

  type RollupRow = { name: string; revenue: Decimal; weight: Decimal; list: Decimal; charged: Decimal };
  const byGreenhouse = new Map<string, RollupRow>();
  const byProduce = new Map<string, RollupRow>();
  for (const r of rows) {
    const gname = r.harvest.greenhouse.name;
    const pname = r.produce.name;
    const listVal = r.weight.times(r.pricePerKg);
    const charged = produceCharged(r);
    const g = byGreenhouse.get(gname) ?? { name: gname, revenue: new Decimal(0), weight: new Decimal(0), list: new Decimal(0), charged: new Decimal(0) };
    byGreenhouse.set(gname, { ...g, revenue: g.revenue.plus(r.amount), weight: g.weight.plus(r.weight), list: g.list.plus(listVal), charged: g.charged.plus(charged) });
    const p = byProduce.get(pname) ?? { name: pname, revenue: new Decimal(0), weight: new Decimal(0), list: new Decimal(0), charged: new Decimal(0) };
    byProduce.set(pname, { ...p, revenue: p.revenue.plus(r.amount), weight: p.weight.plus(r.weight), list: p.list.plus(listVal), charged: p.charged.plus(charged) });
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

  // Render a discount figure (list − charged). Amber when a real discount was
  // given, an em-dash when full price, "+" when it was a markup.
  const discountCell = (list: Decimal, revenue: Decimal) => {
    const d = list.minus(revenue);
    if (d.gt(0.005)) return <span className="text-amber-600">−<Money value={d.toFixed(4)} /></span>;
    if (d.lt(-0.005)) return <span className="text-emerald-600">+<Money value={d.abs().toFixed(4)} /></span>;
    return <span className="text-muted-foreground">—</span>;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Sales</h1>
          <p className="text-sm text-muted-foreground">
            Every produce sale, grouped and filterable by greenhouse, harvest, and date.
          </p>
        </div>
        <DownloadCsvButton type="sales" />
      </header>

      <SalesFilters greenhouses={greenhouses} harvests={harvests} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Records</div><div className="text-2xl font-semibold">{rows.length}</div>{hasFilters ? <div className="text-[10px] text-muted-foreground">filtered</div> : null}</CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total weight</div><div className="text-2xl font-semibold">{totalWeight.toFixed(2)} kg</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total revenue</div><div className="text-2xl font-semibold"><MoneyDual value={totalRevenue.toFixed(4)} align="start" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Avg price / kg</div><div className="text-2xl font-semibold"><MoneyDual value={avgPrice.toFixed(4)} align="start" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Discount given</div><div className="text-2xl font-semibold text-amber-600">{totalDiscount.gt(0.005) ? <MoneyDual value={totalDiscount.toFixed(4)} align="start" /> : <span className="text-muted-foreground">—</span>}</div>{totalList.gt(0) ? <div className="text-[10px] text-muted-foreground">{totalDiscount.div(totalList).times(100).toFixed(1)}% off list</div> : null}</CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">To charity</div><div className="text-2xl font-semibold text-emerald-600">{charityRevenue.gt(0) ? <MoneyDual value={charityRevenue.toFixed(4)} align="start" /> : <span className="text-muted-foreground">—</span>}</div>{charityWeight.gt(0) ? <div className="text-[10px] text-muted-foreground">{charityWeight.toFixed(1)} kg given</div> : null}</CardContent></Card>
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
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>By greenhouse</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Greenhouse</TableHead><TableHead className="text-right">Weight (kg)</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Discount</TableHead></TableRow></TableHeader>
                <TableBody>
                  {greenhouseRollup.map((g) => (
                    <TableRow key={g.name}>
                      <TableCell className="font-medium">{g.name}</TableCell>
                      <TableCell className="text-right">{g.weight.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium"><MoneyDual value={g.revenue.toFixed(4)} /></TableCell>
                      <TableCell className="text-right">{discountCell(g.list, g.charged)}</TableCell>
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
                <TableHeader><TableRow><TableHead>Produce</TableHead><TableHead className="text-right">Weight (kg)</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Discount</TableHead></TableRow></TableHeader>
                <TableBody>
                  {produceRollup.map((p) => (
                    <TableRow key={p.name}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right">{p.weight.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium"><MoneyDual value={p.revenue.toFixed(4)} /></TableCell>
                      <TableCell className="text-right">{discountCell(p.list, p.charged)}</TableCell>
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
            <>
              {/* Desktop: full table. Below lg it would push Amount/Discount
                  off-screen, so we switch to a card list on tablet/phone
                  (app review UX — tablet-first tables). */}
              <div className="hidden lg:block">
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
                      <TableHead className="text-right">Discount</TableHead>
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
                        <TableCell className="text-right"><MoneyDual value={s.pricePerKg.toFixed(4)} /></TableCell>
                        <TableCell className="text-right font-medium"><MoneyDual value={s.amount.toFixed(4)} /></TableCell>
                        <TableCell className="text-right">{discountCell(s.weight.times(s.pricePerKg), produceCharged(s))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Tablet/phone: one card per sale, key figures prominent. */}
              <div className="divide-y lg:hidden">
                {rows.map((s) => (
                  <div key={s.id} className="space-y-1.5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{s.produce.name}</span>
                          <Badge variant="outline">{s.grade}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {s.date.toISOString().slice(0, 10)} · {s.harvest.greenhouse.name}
                        </div>
                        <Link href={`/harvest/${s.harvest.id}`} className="text-xs text-muted-foreground hover:underline">
                          {s.harvest.name}
                        </Link>
                      </div>
                      <div className="shrink-0 text-right font-medium">
                        <MoneyDual value={s.amount.toFixed(4)} />
                        <div className="text-xs font-normal">{discountCell(s.weight.times(s.pricePerKg), produceCharged(s))}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{Number(s.weight)} kg</span>
                      <span className="flex items-center gap-1">
                        <span>@</span>
                        <MoneyDual value={s.pricePerKg.toFixed(4)} />
                        <span>/kg</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
