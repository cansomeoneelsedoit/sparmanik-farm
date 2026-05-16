import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/server/prisma";
import { getHarvestPL } from "@/server/pl";
import { Button } from "@/components/ui/button";
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
import { Decimal } from "@/server/decimal";
import { RecordUsageDialog } from "@/app/(app)/harvest/[harvestId]/record-usage-dialog";
import { LogSaleDialog } from "@/app/(app)/harvest/[harvestId]/log-sale-dialog";
import { EndHarvestButton } from "@/app/(app)/harvest/[harvestId]/end-harvest-button";
import { StartHarvestDialog } from "@/app/(app)/harvest/start-harvest-dialog";
import { DeleteHarvestButton } from "@/app/(app)/harvest/[harvestId]/harvest-actions";
import {
  DeleteSaleButton,
  DeleteUsageButton,
} from "@/app/(app)/harvest/[harvestId]/row-actions";

export const dynamic = "force-dynamic";

export default async function HarvestDetailPage({ params }: { params: Promise<{ harvestId: string }> }) {
  const { harvestId } = await params;
  const [harvest, items, produces, greenhouses] = await Promise.all([
    prisma.harvest.findUnique({
      where: { id: harvestId },
      include: {
        greenhouse: true,
        produce: true,
        sales: { orderBy: { date: "desc" }, include: { produce: true } },
        usages: { orderBy: { date: "desc" }, include: { item: true, consumptions: true } },
        assets: { orderBy: { date: "desc" }, include: { item: true, consumptions: true } },
      },
    }),
    prisma.item.findMany({ orderBy: { name: "asc" } }),
    prisma.produce.findMany({ orderBy: { name: "asc" } }),
    prisma.greenhouse.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!harvest) notFound();

  const pl = await getHarvestPL(harvest.id);
  const totalExpenses = (Number(pl.usageCost) + Number(pl.labourCost) + Number(pl.assetCost)).toFixed(4);

  // Labour lines for this harvest — resolves rates via effective-from history
  const labourLines = await prisma.wageEntryLine.findMany({
    where: { harvestId: harvest.id },
    include: {
      wageEntry: {
        select: {
          date: true,
          staff: {
            select: {
              id: true,
              name: true,
              rates: { orderBy: { effectiveFrom: "desc" }, select: { rate: true, effectiveFrom: true } },
            },
          },
        },
      },
    },
  });
  type LabourLine = {
    id: string;
    hours: Decimal;
    task: string | null;
    wageEntry: {
      date: Date;
      staff: { id: string; name: string; rates: { rate: Decimal; effectiveFrom: Date }[] };
    };
  };
  function effectiveRate(line: LabourLine): Decimal {
    const wageDate = line.wageEntry.date;
    const r = line.wageEntry.staff.rates.find((rate: { rate: Decimal; effectiveFrom: Date }) => rate.effectiveFrom <= wageDate);
    return r ? new Decimal(r.rate) : new Decimal(0);
  }
  const labourRows = (labourLines as LabourLine[]).map((l) => {
    const rate = effectiveRate(l);
    const cost = new Decimal(l.hours).times(rate);
    return { id: l.id, date: l.wageEntry.date, name: l.wageEntry.staff.name, hours: new Decimal(l.hours), rate, cost, task: l.task };
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/harvest"><ArrowLeft className="h-4 w-4" /> Harvests</Link>
          </Button>
          <h1 className="font-serif text-3xl">{harvest.name}</h1>
          <Badge variant={harvest.status === "LIVE" ? "accent" : "secondary"}>
            {harvest.status === "LIVE" ? "Live" : "Closed"}
          </Badge>
        </div>
        <div className="flex gap-2">
          <RecordUsageDialog
            harvestId={harvest.id}
            items={items.map((i: { id: string; name: string; unit: string }) => ({ id: i.id, name: i.name, unit: i.unit }))}
          />
          <LogSaleDialog
            harvestId={harvest.id}
            produces={produces.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))}
          />
          {harvest.status === "LIVE" ? <EndHarvestButton id={harvest.id} /> : null}
          <StartHarvestDialog
            greenhouses={greenhouses.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name }))}
            produces={produces.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))}
            existing={{
              id: harvest.id,
              name: harvest.name,
              greenhouseId: harvest.greenhouseId,
              produceId: harvest.produceId,
              variety: harvest.variety,
              startDate: harvest.startDate.toISOString().slice(0, 10),
              endDate: harvest.endDate ? harvest.endDate.toISOString().slice(0, 10) : null,
              status: harvest.status,
            }}
            trigger={<Button variant="outline">Edit</Button>}
          />
          <DeleteHarvestButton id={harvest.id} name={harvest.name} />
        </div>
      </header>

      <div className="text-sm text-muted-foreground">
        {harvest.greenhouse.name}{harvest.variety ? ` · ${harvest.variety}` : ""}{" "}
        · {harvest.startDate.toISOString().slice(0, 10)}
        {harvest.endDate ? ` → ${harvest.endDate.toISOString().slice(0, 10)}` : ""}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Revenue" value={<Money value={pl.revenue} />} accent="green" />
        <StatCard label="Usage cost" value={<Money value={pl.usageCost} />} accent="red" />
        <StatCard label="Labour cost" value={<Money value={pl.labourCost} />} accent="red" />
        <StatCard label="Net profit" value={<Money value={pl.netProfit} />} accent={Number(pl.netProfit) >= 0 ? "green" : "red"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Sales</CardTitle></CardHeader>
        <CardContent className="p-0">
          {harvest.sales.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No sales yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Produce</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead className="text-right">Weight (kg)</TableHead>
                  <TableHead className="text-right">Price/kg</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(harvest.sales as { id: string; date: Date; produce: { name: string }; grade: string; weight: Decimal; pricePerKg: Decimal; amount: Decimal }[]).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-muted-foreground">{s.date.toISOString().slice(0, 10)}</TableCell>
                    <TableCell>{s.produce.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{s.grade}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{Number(s.weight)}</TableCell>
                    <TableCell className="text-right"><Money value={s.pricePerKg.toFixed(4)} /></TableCell>
                    <TableCell className="text-right font-medium"><Money value={s.amount.toFixed(4)} /></TableCell>
                    <TableCell className="p-0"><DeleteSaleButton id={s.id} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Usage</CardTitle></CardHeader>
        <CardContent className="p-0">
          {harvest.usages.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No usage recorded yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(harvest.usages as { id: string; date: Date; item: { name: string; unit: string }; qty: Decimal; displayQty: string | null; consumptions: { qty: Decimal; unitCost: Decimal }[] }[]).map((u) => {
                  const cost = u.consumptions.reduce((s: Decimal, c) => s.plus(new Decimal(c.qty).times(c.unitCost)), new Decimal(0));
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="text-muted-foreground">{u.date.toISOString().slice(0, 10)}</TableCell>
                      <TableCell>{u.item.name}</TableCell>
                      <TableCell className="text-right">{u.displayQty || `${Number(u.qty)} ${u.item.unit}`}</TableCell>
                      <TableCell className="text-right"><Money value={cost.toFixed(4)} /></TableCell>
                      <TableCell className="p-0"><DeleteUsageButton id={u.id} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Labour expenses</CardTitle></CardHeader>
        <CardContent className="p-0">
          {labourRows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No labour logged against this harvest.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead className="text-right">Hourly rate</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {labourRows.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-muted-foreground">{l.date.toISOString().slice(0, 10)}</TableCell>
                    <TableCell>{l.name}</TableCell>
                    <TableCell className="text-right">{l.hours.toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">{l.task ?? "—"}</TableCell>
                    <TableCell className="text-right"><Money value={l.rate.toFixed(4)} /></TableCell>
                    <TableCell className="text-right font-medium"><Money value={l.cost.toFixed(4)} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fixed assets</CardTitle></CardHeader>
        <CardContent className="p-0">
          {harvest.assets.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No assets installed for this harvest.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Reusable</TableHead>
                  <TableHead>Condition</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(harvest.assets as { id: string; date: Date; item: { name: string; unit: string }; qty: Decimal; reusable: boolean; condition: string | null }[]).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-muted-foreground">{a.date.toISOString().slice(0, 10)}</TableCell>
                    <TableCell>{a.item.name}</TableCell>
                    <TableCell className="text-right">{Number(a.qty)} {a.item.unit}</TableCell>
                    <TableCell>{a.reusable ? <Badge variant="outline">Reusable</Badge> : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{a.condition ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="border-t bg-muted/30 p-3 text-xs text-muted-foreground">
            Fixed assets (reusable installs) are tracked here but excluded from the P&amp;L above.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Profit &amp; Loss statement</CardTitle></CardHeader>
        <CardContent className="space-y-4 p-6 text-sm">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Income</h3>
            <ul className="space-y-1">
              {(harvest.sales as { id: string; date: Date; produce: { name: string }; grade: string; weight: Decimal; amount: Decimal }[]).map((s) => (
                <li key={s.id} className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {s.date.toISOString().slice(0, 10)} — {s.produce.name} (Grade {s.grade}, {Number(s.weight)}kg)
                  </span>
                  <span className="text-green-600"><Money value={s.amount.toFixed(4)} /></span>
                </li>
              ))}
              <li className="mt-2 flex items-center justify-between border-t pt-2 font-semibold">
                <span>Total income</span>
                <span className="text-green-600"><Money value={pl.revenue} /></span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expenses</h3>
            <ul className="space-y-1">
              {(harvest.usages as { id: string; date: Date; item: { name: string }; displayQty: string | null; consumptions: { qty: Decimal; unitCost: Decimal }[] }[]).map((u) => {
                const cost = u.consumptions.reduce((s: Decimal, c) => s.plus(new Decimal(c.qty).times(c.unitCost)), new Decimal(0));
                return (
                  <li key={u.id} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{u.date.toISOString().slice(0, 10)} — {u.item.name} ({u.displayQty ?? ""})</span>
                    <span className="text-red-600"><Money value={cost.toFixed(4)} /></span>
                  </li>
                );
              })}
              {labourRows.map((l) => (
                <li key={l.id} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{l.date.toISOString().slice(0, 10)} — {l.name} ({l.hours.toFixed(2)}h @ <Money value={l.rate.toFixed(4)} />){l.task ? ` — ${l.task}` : ""}</span>
                  <span className="text-red-600"><Money value={l.cost.toFixed(4)} /></span>
                </li>
              ))}
              <li className="mt-2 flex items-center justify-between border-t pt-2 font-semibold">
                <span>Total expenses</span>
                <span className="text-red-600"><Money value={totalExpenses} /></span>
              </li>
            </ul>
          </section>

          <section className={`flex items-center justify-between rounded-md border p-3 font-semibold ${Number(pl.netProfit) >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
            <span>Net profit</span>
            <span className={Number(pl.netProfit) >= 0 ? "text-green-600" : "text-red-600"}><Money value={pl.netProfit} /></span>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: React.ReactNode; accent: "green" | "red" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold ${accent === "green" ? "text-green-600" : "text-red-600"}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
