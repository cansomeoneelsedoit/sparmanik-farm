import Link from "next/link";
import { Plus } from "lucide-react";

import { prisma } from "@/server/prisma";
import { getHarvestPL } from "@/server/pl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/shared/money";
import { StartHarvestDialog } from "@/app/(app)/harvest/start-harvest-dialog";

export const dynamic = "force-dynamic";

export default async function HarvestPage() {
  const [harvests, greenhouses, produces] = await Promise.all([
    prisma.harvest.findMany({
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      include: { greenhouse: true, produce: true },
    }),
    prisma.greenhouse.findMany({ orderBy: { name: "asc" } }),
    prisma.produce.findMany({ orderBy: { name: "asc" } }),
  ]);

  const enriched = await Promise.all(
    (harvests as { id: string; name: string; variety: string | null; status: "LIVE" | "CLOSED"; startDate: Date; endDate: Date | null; greenhouse: { name: string }; produce: { name: string } | null }[]).map(async (h) => {
      const pl = await getHarvestPL(h.id);
      return { ...h, pl };
    }),
  );

  const live = enriched.filter((h) => h.status === "LIVE");
  const closed = enriched.filter((h) => h.status === "CLOSED");

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">Harvests</h1>
        <StartHarvestDialog
          greenhouses={greenhouses.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name }))}
          produces={produces.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))}
          trigger={<Button><Plus className="h-4 w-4" /> Start harvest</Button>}
        />
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Active</h2>
        {live.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-muted-foreground">No active harvests.</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {live.map((h) => (
              <Link href={`/harvest/${h.id}`} key={h.id}>
                <Card className="cursor-pointer transition hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{h.name}</CardTitle>
                      <Badge variant="accent">Live</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{h.greenhouse.name}{h.variety ? ` · ${h.variety}` : ""}</div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <Stat label="Revenue" value={<Money value={h.pl.revenue} />} positive />
                    <Stat label="Expenses" value={<Money value={String(Number(h.pl.usageCost) + Number(h.pl.labourCost) + Number(h.pl.depreciationCost))} />} />
                    <Stat label="Net" value={<Money value={h.pl.netProfit} />} highlight />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {closed.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Past</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {closed.map((h) => (
              <Link href={`/harvest/${h.id}`} key={h.id}>
                <Card className="cursor-pointer opacity-80 transition hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{h.name}</CardTitle>
                      <Badge variant="secondary">Closed</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{h.greenhouse.name}</div>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <Stat label="Net" value={<Money value={h.pl.netProfit} />} highlight />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value, highlight, positive }: { label: string; value: React.ReactNode; highlight?: boolean; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={highlight ? "font-medium" : positive ? "text-green-600" : ""}>{value}</span>
    </div>
  );
}
