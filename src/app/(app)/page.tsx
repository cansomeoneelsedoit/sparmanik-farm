import Link from "next/link";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { getAlerts } from "@/server/alerts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/shared/money";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [activeHarvests, totalItems, totalStaff, sales, alerts] = await Promise.all([
    prisma.harvest.count({ where: { status: "LIVE" } }),
    prisma.item.count(),
    prisma.staff.count(),
    prisma.sale.findMany({ select: { amount: true } }),
    getAlerts(),
  ]);

  const totalRevenue = (sales as { amount: Decimal }[]).reduce((s: Decimal, x) => s.plus(x.amount), new Decimal(0));

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Active harvests" value={String(activeHarvests)} />
        <Stat label="Inventory items" value={String(totalItems)} />
        <StatMoney label="Total revenue" value={totalRevenue.toFixed(4)} />
        <Stat label="Staff" value={String(totalStaff)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Alerts</CardTitle></CardHeader>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function StatMoney({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold"><Money value={value} /></div>
      </CardContent>
    </Card>
  );
}
