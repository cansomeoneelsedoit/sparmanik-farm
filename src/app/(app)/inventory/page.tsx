import Link from "next/link";
import { Plus } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/shared/money";
import { InventoryFilters } from "@/app/(app)/inventory/inventory-filters";
import { NewItemDialog } from "@/app/(app)/inventory/new-item-dialog";

export const dynamic = "force-dynamic";

type Sort = "name" | "stock" | "value" | "recent";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; sort?: Sort }>;
}) {
  const { q = "", cat = "", sort = "name" } = await searchParams;

  type ItemRow = {
    id: string;
    name: string;
    unit: string;
    reorder: Decimal;
    category: { name: string } | null;
    batches: { qty: Decimal; price: Decimal; consumptions: { qty: Decimal }[] }[];
  };

  const [items, categories, suppliers] = await Promise.all([
    prisma.item.findMany({
      where: {
        AND: [
          q ? { name: { contains: q, mode: "insensitive" as const } } : {},
          cat ? { category: { name: cat } } : {},
        ],
      },
      include: {
        category: true,
        batches: { select: { qty: true, price: true, consumptions: { select: { qty: true } } } },
      },
      orderBy: sort === "name" ? { name: "asc" } : sort === "recent" ? { createdAt: "desc" } : { name: "asc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
  ]);

  const rows = (items as ItemRow[]).map((item) => {
    const stock = item.batches.reduce((s: Decimal, b) => {
      const consumed = b.consumptions.reduce((cs: Decimal, c) => cs.plus(c.qty), new Decimal(0));
      return s.plus(new Decimal(b.qty).minus(consumed));
    }, new Decimal(0));
    const value = item.batches.reduce((s: Decimal, b) => {
      const consumed = b.consumptions.reduce((cs: Decimal, c) => cs.plus(c.qty), new Decimal(0));
      const remaining = new Decimal(b.qty).minus(consumed);
      return s.plus(remaining.times(b.price));
    }, new Decimal(0));
    return { ...item, stock, value };
  });

  if (sort === "stock") rows.sort((a, b) => a.stock.cmp(b.stock));
  if (sort === "value") rows.sort((a, b) => b.value.cmp(a.value));

  const totals = rows.reduce(
    (acc: { items: number; value: Decimal }, r) => ({
      items: acc.items + 1,
      value: acc.value.plus(r.value),
    }),
    { items: 0, value: new Decimal(0) },
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">Inventory</h1>
        <NewItemDialog
          categories={categories.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))}
          suppliers={suppliers.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))}
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> New item
            </Button>
          }
        />
      </header>

      <InventoryFilters categories={categories.map((c: { name: string }) => c.name)} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Items</div><div className="text-2xl font-semibold">{totals.items}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total value</div><div className="text-2xl font-semibold"><Money value={totals.value.toFixed(4)} /></div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No items match your filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Reorder</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const reorder = new Decimal(r.reorder);
                  const low = reorder.gt(0) && r.stock.lte(reorder.times(0.5));
                  const crit = reorder.gt(0) && r.stock.lte(reorder.times(0.2));
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link
                          href={`/inventory/${r.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {r.name?.trim() || (
                            <span className="italic text-muted-foreground">Untitled item</span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.category?.name ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <span className={crit ? "text-destructive font-medium" : low ? "text-yellow-600" : ""}>
                          {r.stock.toFixed(0)} {r.unit}
                        </span>
                        {crit ? (
                          <Badge variant="destructive" className="ml-2">Low</Badge>
                        ) : low ? (
                          <Badge variant="secondary" className="ml-2">Warn</Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{reorder.toFixed(0)}</TableCell>
                      <TableCell className="text-right"><Money value={r.value.toFixed(4)} /></TableCell>
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
