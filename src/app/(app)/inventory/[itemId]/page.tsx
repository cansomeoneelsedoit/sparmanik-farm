import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money } from "@/components/shared/money";
import { ReceiveStockDialog } from "@/app/(app)/inventory/[itemId]/receive-stock-dialog";
import { UseStockDialog } from "@/app/(app)/inventory/[itemId]/use-stock-dialog";

export const dynamic = "force-dynamic";

export default async function ItemDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const [item, suppliers] = await Promise.all([
    prisma.item.findUnique({
      where: { id: itemId },
      include: {
        category: true,
        defaultSupplier: true,
        batches: {
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          include: { supplier: true, consumptions: { select: { qty: true } } },
        },
      },
    }),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!item) notFound();

  type BatchRow = {
    id: string;
    date: Date;
    qty: Decimal;
    price: Decimal;
    consumptions: { qty: Decimal }[];
    supplier: { name: string } | null;
  };

  const batchesWithRemaining = (item.batches as BatchRow[]).map((b) => {
    const consumed = b.consumptions.reduce((s: Decimal, c) => s.plus(c.qty), new Decimal(0));
    const remaining = new Decimal(b.qty).minus(consumed);
    return { ...b, consumed, remaining };
  });

  const totalStock = batchesWithRemaining.reduce((s: Decimal, b) => s.plus(b.remaining), new Decimal(0));
  const totalValue = batchesWithRemaining.reduce((s: Decimal, b) => s.plus(b.remaining.times(b.price)), new Decimal(0));
  const avgCost = totalStock.gt(0) ? totalValue.div(totalStock) : new Decimal(0);
  const lastPrice = item.batches.length ? item.batches[item.batches.length - 1].price : new Decimal(0);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/inventory"><ArrowLeft className="h-4 w-4" /> Inventory</Link>
          </Button>
          <h1 className="font-serif text-3xl">{item.name}</h1>
        </div>
        <div className="flex gap-2">
          <ReceiveStockDialog
            itemId={item.id}
            suppliers={suppliers.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))}
            defaultSupplierId={item.defaultSupplierId ?? undefined}
          />
          <UseStockDialog itemId={item.id} maxQty={totalStock.toString()} unit={item.unit} />
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="On hand" value={`${totalStock.toFixed(0)} ${item.unit}`} />
        <StatMoney label="Total value" value={totalValue.toFixed(4)} />
        <StatMoney label="Avg cost" value={avgCost.toFixed(4)} />
        <StatMoney label="Last paid" value={lastPrice.toFixed(4)} />
      </div>

      <Card>
        <CardContent className="grid gap-2 p-4 text-sm sm:grid-cols-4">
          <Detail label="Category" value={item.category?.name ?? "—"} />
          <Detail label="Default supplier" value={item.defaultSupplier?.name ?? "—"} />
          <Detail label="Location" value={item.location ?? "—"} />
          <Detail label="Reorder at" value={`${item.reorder.toString()} ${item.unit}`} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {batchesWithRemaining.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              No batches yet. Click <strong>Receive stock</strong> to add the first one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Batch value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchesWithRemaining.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-muted-foreground">{b.date.toISOString().slice(0, 10)}</TableCell>
                    <TableCell>{b.supplier?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">{Number(b.qty)} {item.unit}</TableCell>
                    <TableCell className="text-right">{b.remaining.toFixed(0)} {item.unit}</TableCell>
                    <TableCell className="text-right"><Money value={b.price.toFixed(4)} /></TableCell>
                    <TableCell className="text-right font-medium"><Money value={b.remaining.times(b.price).toFixed(4)} /></TableCell>
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
