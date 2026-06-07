import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  DollarSign,
  Leaf,
  Package,
  TrendingUp,
  UserCircle2,
} from "lucide-react";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { getAlerts } from "@/server/alerts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/shared/money";
import { PieChart } from "@/components/shared/pie-chart";
import { SalesCharts } from "@/app/(app)/sales/sales-charts";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SALES_WINDOW_DAYS = 30;

export default async function DashboardPage() {
  const sinceDate = new Date();
  sinceDate.setUTCHours(0, 0, 0, 0);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - (SALES_WINDOW_DAYS - 1));

  const [
    activeHarvests,
    totalItems,
    totalStaff,
    openTasks,
    allSales,
    recentSales,
    alerts,
    items,
  ] = await Promise.all([
    prisma.harvest.count({ where: { status: "LIVE" } }),
    prisma.item.count(),
    prisma.staff.count(),
    prisma.task.count({ where: { status: { not: "COMPLETED" } } }),
    prisma.sale.findMany({
      select: { amount: true, date: true, weight: true },
    }),
    prisma.sale.findMany({
      where: { date: { gte: sinceDate } },
      orderBy: { date: "desc" },
      include: {
        harvest: { select: { greenhouse: { select: { name: true } } } },
        produce: { select: { name: true } },
      },
    }),
    getAlerts(),
    prisma.item.findMany({
      select: {
        id: true,
        category: { select: { name: true } },
        batches: { select: { qty: true, price: true, consumptions: { select: { qty: true } } } },
      },
    }),
  ]);

  type Sale = { amount: Decimal; date: Date; weight: Decimal };
  type SaleWithRefs = Sale & {
    harvest: { greenhouse: { name: string } };
    produce: { name: string };
  };

  const totalRevenue = (allSales as Sale[]).reduce(
    (s: Decimal, x) => s.plus(x.amount),
    new Decimal(0),
  );
  const totalWeight = (allSales as Sale[]).reduce(
    (s: Decimal, x) => s.plus(x.weight),
    new Decimal(0),
  );
  const windowRevenue = (recentSales as SaleWithRefs[]).reduce(
    (s: Decimal, x) => s.plus(x.amount),
    new Decimal(0),
  );

  // Local IDR formatter — same pattern as /sales. Pre-format so the chart
  // (which is a client component) doesn't need to touch <Money> and pull
  // Prisma into the browser bundle.
  const fmtIDR = (v: Decimal | number) =>
    `Rp ${Number(new Decimal(v).toFixed(0)).toLocaleString("id-ID")}`;

  // Day-by-day series for the dashboard trend strip — same shape that the
  // Sales page already feeds to SalesCharts so we get pixel-identical
  // visuals for free.
  const dailyRevenue = new Map<string, Decimal>();
  for (const r of recentSales as SaleWithRefs[]) {
    const day = r.date.toISOString().slice(0, 10);
    dailyRevenue.set(day, (dailyRevenue.get(day) ?? new Decimal(0)).plus(r.amount));
  }
  const trend: { date: string; revenue: string; revenueFormatted: string }[] = [];
  for (let i = 0; i < SALES_WINDOW_DAYS; i += 1) {
    const d = new Date(sinceDate);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    const rev = dailyRevenue.get(key) ?? new Decimal(0);
    trend.push({
      date: key,
      revenue: rev.toFixed(4),
      revenueFormatted: fmtIDR(rev),
    });
  }

  // Rollups for the bar charts inside SalesCharts.
  const byGh = new Map<string, Decimal>();
  const byProd = new Map<string, Decimal>();
  for (const r of recentSales as SaleWithRefs[]) {
    byGh.set(
      r.harvest.greenhouse.name,
      (byGh.get(r.harvest.greenhouse.name) ?? new Decimal(0)).plus(r.amount),
    );
    byProd.set(r.produce.name, (byProd.get(r.produce.name) ?? new Decimal(0)).plus(r.amount));
  }
  const byGreenhouse = Array.from(byGh.entries())
    .map(([label, v]) => ({ label, value: v.toFixed(4), valueFormatted: fmtIDR(v) }))
    .sort((a, b) => Number(b.value) - Number(a.value));
  const byProduce = Array.from(byProd.entries())
    .map(([label, v]) => ({ label, value: v.toFixed(4), valueFormatted: fmtIDR(v) }))
    .sort((a, b) => Number(b.value) - Number(a.value));

  // Inventory value pie — group items' on-hand value by category. Useful at
  // a glance to know "where is my capital tied up".
  type ItemWithBatches = {
    id: string;
    category: { name: string } | null;
    batches: { qty: Decimal; price: Decimal; consumptions: { qty: Decimal }[] }[];
  };
  const categoryValue = new Map<string, number>();
  let inventoryValue = new Decimal(0);
  for (const it of items as ItemWithBatches[]) {
    let value = new Decimal(0);
    for (const b of it.batches) {
      const consumed = b.consumptions.reduce(
        (s: Decimal, c) => s.plus(c.qty),
        new Decimal(0),
      );
      const remaining = new Decimal(b.qty).minus(consumed);
      if (remaining.gt(0)) value = value.plus(remaining.times(b.price));
    }
    const cat = it.category?.name ?? "Uncategorised";
    categoryValue.set(cat, (categoryValue.get(cat) ?? 0) + Number(value));
    inventoryValue = inventoryValue.plus(value);
  }
  const inventorySlices = Array.from(categoryValue.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  // Top-produce slices for the sales donut — same data shape but as
  // numbers so PieChart can size the arcs.
  const produceSlices = byProduce.map((b) => ({
    label: b.label,
    value: Number(b.value),
  }));

  const avgPricePerKg = totalWeight.gt(0)
    ? totalRevenue.div(totalWeight)
    : new Decimal(0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Day-to-day pulse — sales window, alerts, and inventory value at a glance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/sales">
              <DollarSign className="h-4 w-4" /> Sales detail
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/harvest">
              <Leaf className="h-4 w-4" /> Greenhouses
            </Link>
          </Button>
        </div>
      </header>

      {/* Headline strip — 2 cols on phone, 4 on tablet+ */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          icon={<Leaf className="h-5 w-5" />}
          label="Active harvests"
          value={activeHarvests.toString()}
          tint="emerald"
          href="/harvest"
        />
        <StatMoney
          icon={<DollarSign className="h-5 w-5" />}
          label={`Revenue · ${SALES_WINDOW_DAYS}d`}
          value={windowRevenue.toFixed(4)}
          tint="emerald"
          href="/sales"
        />
        <StatMoney
          icon={<Package className="h-5 w-5" />}
          label="Inventory value"
          value={inventoryValue.toFixed(4)}
          tint="indigo"
          href="/inventory"
        />
        <Stat
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Open tasks"
          value={openTasks.toString()}
          tint={openTasks > 0 ? "amber" : "muted"}
          href="/tasks"
        />
      </div>

      {/* Secondary strip — totals + people */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          icon={<Package className="h-5 w-5" />}
          label="Inventory items"
          value={totalItems.toString()}
          tint="slate"
          href="/inventory"
        />
        <Stat
          icon={<UserCircle2 className="h-5 w-5" />}
          label="Staff"
          value={totalStaff.toString()}
          tint="slate"
          href="/staff"
        />
        <StatMoney
          icon={<TrendingUp className="h-5 w-5" />}
          label="Lifetime revenue"
          value={totalRevenue.toFixed(4)}
          tint="emerald"
          href="/financials"
        />
        <StatMoney
          icon={<DollarSign className="h-5 w-5" />}
          label="Avg price / kg"
          value={avgPricePerKg.toFixed(4)}
          tint="indigo"
          href="/sales"
        />
      </div>

      <SalesCharts trend={trend} byGreenhouse={byGreenhouse} byProduce={byProduce} />

      {/* Donut row — sales mix + inventory mix */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4 text-emerald-600" />
              Sales mix · last {SALES_WINDOW_DAYS} days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {produceSlices.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No sales in window
              </p>
            ) : (
              <PieChart
                data={produceSlices}
                centreLabel={`Rp ${Math.round(windowRevenue.toNumber() / 1000)}k`}
                centreSub="this window"
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-indigo-600" />
              Inventory value · by category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {inventorySlices.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No on-hand stock
              </p>
            ) : (
              <PieChart
                data={inventorySlices}
                centreLabel={`Rp ${Math.round(inventoryValue.toNumber() / 1000)}k`}
                centreSub="on hand"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alerts — same as before but now under the charts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" />
            Alerts
            {alerts.length > 0 ? (
              <Badge variant="secondary" className="ml-auto">
                {alerts.length}
              </Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-4">
          {alerts.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">All clear.</div>
          ) : (
            alerts.slice(0, 10).map((a) => (
              <Link
                key={a.id}
                href={a.href}
                className="flex items-start gap-2 rounded-md border bg-background p-3 text-sm transition hover:bg-accent/5"
              >
                <span
                  className={cn(
                    "mt-1 inline-block h-2 w-2 shrink-0 rounded-full",
                    a.severity === "critical" && "bg-destructive",
                    a.severity === "warning" && "bg-yellow-500",
                    a.severity === "low" && "bg-accent",
                  )}
                />
                <span>{a.text}</span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  tint,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tint: "indigo" | "emerald" | "amber" | "slate" | "muted";
  href?: string;
}) {
  const tints: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
    muted: "bg-muted text-muted-foreground",
  };
  const body = (
    <Card className="overflow-hidden transition hover:shadow-md">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", tints[tint])}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span className="truncate">{label}</span>
            {href ? <ArrowUpRight className="h-3 w-3" /> : null}
          </div>
          <div className="truncate text-xl font-semibold">{value}</div>
          {sub ? <div className="text-[10px] text-muted-foreground">{sub}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function StatMoney({
  icon,
  label,
  value,
  tint,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tint: "indigo" | "emerald" | "amber" | "slate" | "muted";
  href?: string;
}) {
  const tints: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
    muted: "bg-muted text-muted-foreground",
  };
  const body = (
    <Card className="overflow-hidden transition hover:shadow-md">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", tints[tint])}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span className="truncate">{label}</span>
            {href ? <ArrowUpRight className="h-3 w-3" /> : null}
          </div>
          <div className="truncate text-xl font-semibold">
            <Money value={value} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
