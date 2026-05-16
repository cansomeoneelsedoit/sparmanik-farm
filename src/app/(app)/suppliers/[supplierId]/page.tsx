import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money } from "@/components/shared/money";
import { SupplierFormDialog } from "@/app/(app)/suppliers/supplier-form-dialog";
import { SupplierDeleteButton } from "@/app/(app)/suppliers/[supplierId]/supplier-delete-button";

export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({ params }: { params: Promise<{ supplierId: string }> }) {
  const { supplierId } = await params;
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: {
      batches: {
        include: { item: { select: { id: true, name: true, unit: true } } },
        orderBy: { date: "desc" },
      },
      items: { select: { id: true, name: true } },
    },
  });

  if (!supplier) notFound();

  const totalSpend = supplier.batches.reduce(
    (sum: number, b: { qty: unknown; price: unknown }) => sum + Number(b.qty) * Number(b.price),
    0,
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/suppliers"><ArrowLeft className="h-4 w-4" /> Suppliers</Link>
          </Button>
          <h1 className="font-serif text-3xl">{supplier.name}</h1>
        </div>
        <div className="flex gap-2">
          <SupplierFormDialog
            existing={supplier}
            trigger={<Button variant="outline">Edit</Button>}
          />
          <SupplierDeleteButton id={supplier.id} name={supplier.name} />
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Phone</CardTitle></CardHeader>
          <CardContent>{supplier.phone || "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Email</CardTitle></CardHeader>
          <CardContent>{supplier.email || "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Total spend</CardTitle></CardHeader>
          <CardContent className="font-medium"><Money value={totalSpend.toFixed(4)} /></CardContent>
        </Card>
      </div>

      {supplier.notes ? (
        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">{supplier.notes}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Purchases</CardTitle></CardHeader>
        <CardContent className="p-0">
          {supplier.batches.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No purchases yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Line value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplier.batches.map((b: { id: string; date: Date; qty: { toFixed(d: number): string }; price: { toFixed(d: number): string }; item: { id: string; name: string; unit: string } }) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-muted-foreground">{b.date.toISOString().slice(0, 10)}</TableCell>
                    <TableCell>
                      <Link href={`/inventory/${b.item.id}`} className="hover:underline">
                        {b.item.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">{Number(b.qty)} {b.item.unit}</TableCell>
                    <TableCell className="text-right"><Money value={b.price.toFixed(4)} /></TableCell>
                    <TableCell className="text-right font-medium">
                      <Money value={(Number(b.qty) * Number(b.price)).toFixed(4)} />
                    </TableCell>
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
