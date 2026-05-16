import Link from "next/link";
import { Plus } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/shared/money";
import { SupplierFormDialog } from "@/app/(app)/suppliers/supplier-form-dialog";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: {
      batches: { select: { qty: true, price: true } },
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">Suppliers</h1>
        <SupplierFormDialog trigger={
          <Button>
            <Plus className="h-4 w-4" />
            Add supplier
          </Button>
        } />
      </header>

      {suppliers.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            No suppliers yet. Add one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((s: { id: string; name: string; phone: string | null; email: string | null; batches: { qty: unknown; price: unknown }[] }) => {
            const totalSpend = s.batches.reduce(
              (sum: number, b) => sum + Number(b.qty) * Number(b.price),
              0,
            );
            const initials = s.name
              .split(/\s+/)
              .map((p: string) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();
            return (
              <Card key={s.id} className="transition hover:shadow-md">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 font-semibold text-accent">
                      {initials}
                    </div>
                    <CardTitle>{s.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {s.phone ? <div className="text-muted-foreground">{s.phone}</div> : null}
                  {s.email ? <div className="text-muted-foreground">{s.email}</div> : null}
                  <div className="flex items-center justify-between border-t pt-3 text-xs">
                    <span className="text-muted-foreground">{s.batches.length} purchases</span>
                    <span className="font-medium">
                      <Money value={totalSpend.toFixed(4)} />
                    </span>
                  </div>
                  <div className="pt-2">
                    <Button asChild size="sm" variant="outline" className="w-full">
                      <Link href={`/suppliers/${s.id}`}>View</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
