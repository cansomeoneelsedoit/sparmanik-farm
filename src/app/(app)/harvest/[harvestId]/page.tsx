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

export const dynamic = "force-dynamic";

export default async function HarvestDetailPage({ params }: { params: Promise<{ harvestId: string }> }) {
  const { harvestId } = await params;
  const [harvest, items, produces] = await Promise.all([
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
  ]);

  if (!harvest) notFound();

  const pl = await getHarvestPL(harvest.id);
  const totalExpenses = (Number(pl.usageCost) + Number(pl.labourCost) + Number(pl.assetCost)).toFixed(4);

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
            items={items.map((i: { id: string; name: string; unit: string }) => i)}
          />
          <LogSaleDialog
            harvestId={harvest.id}
            produces={produces.map((p: { id: string; name: string }) => p)}
          />
          {harvest.status === "LIVE" ? <EndHarvestButton id={harvest.id} /> : null}
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
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Total expenses (usage + labour + assets): <Money value={totalExpenses} />
      </div>
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
