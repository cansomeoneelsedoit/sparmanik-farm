import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { Badge } from "@/components/ui/badge";
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
import { NewItemDialog } from "@/app/(app)/inventory/new-item-dialog";
import { DeleteItemButton } from "@/app/(app)/inventory/[itemId]/item-actions";
import { DeleteBatchButton } from "@/app/(app)/inventory/[itemId]/batch-actions";

export const dynamic = "force-dynamic";

export default async function ItemDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const [item, suppliers, categories] = await Promise.all([
    // findFirst (not findUnique) — the prisma extension auto-appends
    // organizationId for org isolation, which findUnique rejects.
    prisma.item.findFirst({
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
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!item) notFound();

  type BatchRow = {
    id: string;
    date: Date;
    qty: Decimal;
    price: Decimal;
    consumptions: { qty: Decimal }[];
    supplier: { id: string; name: string } | null;
    maxUses: number;
    useCount: number;
    amortisedCostPerUse: Decimal | null;
    returned: boolean;
  };

  const batchesWithRemaining = (item.batches as BatchRow[]).map((b) => {
    const consumed = b.consumptions.reduce((s: Decimal, c) => s.plus(c.qty), new Decimal(0));
    const remaining = new Decimal(b.qty).minus(consumed);
    const depreciable = b.maxUses > 1;
    const remainingUses = Math.max(0, b.maxUses - b.useCount);
    const unrecoveredValue =
      depreciable && b.amortisedCostPerUse
        ? new Decimal(b.amortisedCostPerUse).times(remainingUses).times(remaining)
        : new Decimal(0);
    return { ...b, consumed, remaining, depreciable, remainingUses, unrecoveredValue };
  });

  const totalStock = batchesWithRemaining.reduce((s: Decimal, b) => s.plus(b.remaining), new Decimal(0));
  const totalValue = batchesWithRemaining.reduce((s: Decimal, b) => s.plus(b.remaining.times(b.price)), new Decimal(0));
  const avgCost = totalStock.gt(0) ? totalValue.div(totalStock) : new Decimal(0);
  const lastPrice = item.batches.length ? item.batches[item.batches.length - 1].price : new Decimal(0);

  // Roll up purchase history per supplier. Counts every batch (including
  // already-fully-consumed ones) so the user sees the full procurement
  // story — who we've bought from and how much we've spent with each.
  type SupplierAgg = {
    id: string;
    name: string;
    batches: number;
    totalQty: Decimal;
    totalSpent: Decimal;
    lastDate: Date | null;
  };
  const supplierMap = new Map<string, SupplierAgg>();
  for (const b of batchesWithRemaining) {
    const key = b.supplier?.id ?? "_none";
    const name = b.supplier?.name ?? "Unknown supplier";
    const qty = new Decimal(b.qty);
    const spent = qty.times(b.price);
    const existing = supplierMap.get(key);
    if (existing) {
      existing.batches += 1;
      existing.totalQty = existing.totalQty.plus(qty);
      existing.totalSpent = existing.totalSpent.plus(spent);
      if (!existing.lastDate || b.date > existing.lastDate) existing.lastDate = b.date;
    } else {
      supplierMap.set(key, {
        id: key,
        name,
        batches: 1,
        totalQty: qty,
        totalSpent: spent,
        lastDate: b.date,
      });
    }
  }
  const supplierRows = Array.from(supplierMap.values()).sort((a, b) =>
    b.totalSpent.cmp(a.totalSpent),
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/inventory"><ArrowLeft className="h-4 w-4" /> Inventory</Link>
          </Button>
          <div>
            <h1 className="font-serif text-3xl">
              {item.name?.trim() || (
                <span className="italic text-muted-foreground">Untitled item</span>
              )}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs tracking-wider text-muted-foreground">
                {item.code}
              </span>
              {item.category ? (
                <Link
                  href={`/inventory?cat=${encodeURIComponent(item.category.name)}`}
                  className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:border-accent hover:text-foreground"
                >
                  {item.category.name}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <ReceiveStockDialog
            itemId={item.id}
            itemUnit={item.unit}
            itemSubUnit={item.subUnit}
            itemSubFactor={item.subFactor ? Number(item.subFactor) : null}
            itemReusable={item.reusable}
            suppliers={suppliers.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))}
            defaultSupplierId={item.defaultSupplierId ?? undefined}
          />
          <UseStockDialog itemId={item.id} maxQty={totalStock.toString()} unit={item.unit} />
          <NewItemDialog
            trigger={<Button variant="outline">Edit</Button>}
            categories={categories.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))}
            suppliers={suppliers.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))}
            existing={{
              id: item.id,
              name: item.name,
              description: item.description,
              photoPath: item.photoPath,
              unit: item.unit,
              subUnit: item.subUnit,
              subFactor: item.subFactor ? item.subFactor.toString() : null,
              categoryId: item.categoryId,
              defaultSupplierId: item.defaultSupplierId,
              reorder: item.reorder.toFixed(4),
              location: item.location,
              reusable: item.reusable,
              shopeeUrl: item.shopeeUrl,
            }}
          />
          <DeleteItemButton id={item.id} name={item.name} />
        </div>
      </header>

      {item.photoPath || item.description ? (
        <Card>
          <CardContent className="flex gap-4 p-4">
            {item.photoPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/uploads/${item.photoPath}`}
                alt={item.name}
                className="h-32 w-32 shrink-0 rounded-md border object-cover"
              />
            ) : null}
            {item.description ? (
              <p className="self-center whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

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

      {supplierRows.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3">
              <h2 className="font-medium">Purchase history by supplier</h2>
              <p className="text-xs text-muted-foreground">
                Every supplier this item has ever been bought from, ranked by total spent.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Batches</TableHead>
                  <TableHead className="text-right">Total qty</TableHead>
                  <TableHead className="text-right">Total spent</TableHead>
                  <TableHead className="text-right">Avg price</TableHead>
                  <TableHead>Last received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierRows.map((s) => {
                  const avg = s.totalQty.gt(0) ? s.totalSpent.div(s.totalQty) : new Decimal(0);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{s.batches}</TableCell>
                      <TableCell className="text-right">{s.totalQty.toFixed(0)} {item.unit}</TableCell>
                      <TableCell className="text-right"><Money value={s.totalSpent.toFixed(4)} /></TableCell>
                      <TableCell className="text-right"><Money value={avg.toFixed(4)} /></TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.lastDate ? s.lastDate.toISOString().slice(0, 10) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

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
                  <TableHead>Uses</TableHead>
                  <TableHead className="text-right">Unrecovered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchesWithRemaining.map((b) => {
                  const fullyDepreciated = b.depreciable && b.useCount >= b.maxUses;
                  const statusLabel = !b.depreciable
                    ? b.returned
                      ? "Returned"
                      : "Standard"
                    : fullyDepreciated
                      ? "Fully depreciated"
                      : b.useCount === 0
                        ? "New"
                        : `In use (${b.useCount} of ${b.maxUses})`;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="text-muted-foreground">{b.date.toISOString().slice(0, 10)}</TableCell>
                      <TableCell>{b.supplier?.name ?? "—"}</TableCell>
                      <TableCell className="text-right">{Number(b.qty)} {item.unit}</TableCell>
                      <TableCell className="text-right">{b.remaining.toFixed(0)} {item.unit}</TableCell>
                      <TableCell className="text-right">
                        <Money value={b.price.toFixed(4)} />
                        {b.returned ? <span className="ml-1 text-xs text-muted-foreground">(returned)</span> : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {b.depreciable ? `${b.useCount} / ${b.maxUses}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {b.depreciable ? <Money value={b.unrecoveredValue.toFixed(4)} /> : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={fullyDepreciated ? "destructive" : b.depreciable ? "outline" : "secondary"}>
                          {statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-0"><DeleteBatchButton id={b.id} /></TableCell>
                    </TableRow>
                  );
                })}
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
