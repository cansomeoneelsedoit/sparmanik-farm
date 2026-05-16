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

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const sales = await prisma.sale.findMany({
    orderBy: { date: "desc" },
    include: { harvest: true, produce: true },
  });

  const totalRevenue = (sales as { amount: Decimal }[]).reduce((s: Decimal, x) => s.plus(x.amount), new Decimal(0));
  const totalWeight = (sales as { weight: Decimal }[]).reduce((s: Decimal, x) => s.plus(x.weight), new Decimal(0));

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">Sales</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Records</div><div className="text-2xl font-semibold">{sales.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total weight (kg)</div><div className="text-2xl font-semibold">{totalWeight.toFixed(2)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total revenue</div><div className="text-2xl font-semibold"><Money value={totalRevenue.toFixed(4)} /></div></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>All sales</CardTitle></CardHeader>
        <CardContent className="p-0">
          {sales.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No sales yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Harvest</TableHead>
                  <TableHead>Produce</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Price/kg</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sales as { id: string; date: Date; harvest: { name: string }; produce: { name: string }; grade: string; weight: Decimal; pricePerKg: Decimal; amount: Decimal }[]).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-muted-foreground">{s.date.toISOString().slice(0, 10)}</TableCell>
                    <TableCell>{s.harvest.name}</TableCell>
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
