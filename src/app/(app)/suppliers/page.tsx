import { Plus } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { Button } from "@/components/ui/button";
import { SupplierFormDialog } from "@/app/(app)/suppliers/supplier-form-dialog";
import {
  SuppliersListClient,
  type SupplierRow,
} from "@/app/(app)/suppliers/suppliers-list-client";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: {
      // Pull each batch's parent item so we can build a per-supplier product
      // list. Used both for the "products supplied" card chip strip and the
      // product-name search box at the top of the list.
      batches: {
        select: {
          qty: true,
          price: true,
          date: true,
          item: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });

  type SupplierWithBatches = {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    batches: {
      qty: Decimal;
      price: Decimal;
      date: Date;
      item: { id: string; code: string; name: string };
    }[];
  };

  const rows: SupplierRow[] = (suppliers as SupplierWithBatches[]).map((s) => {
    const totalSpend = s.batches.reduce(
      (sum: Decimal, b) => sum.plus(new Decimal(b.qty).times(b.price)),
      new Decimal(0),
    );
    const lastDelivery = s.batches.length
      ? s.batches
          .map((b) => b.date)
          .sort((a, b) => b.getTime() - a.getTime())[0]
          .toISOString()
          .slice(0, 10)
      : null;
    // Roll up items supplied. One supplier may stock the same item across
    // many batches — dedupe by item.id and sum spend per item so the chip
    // list stays readable even after dozens of restocks.
    const itemAgg = new Map<
      string,
      { id: string; code: string; name: string; spend: Decimal; batches: number }
    >();
    for (const b of s.batches) {
      const existing = itemAgg.get(b.item.id);
      const spend = new Decimal(b.qty).times(b.price);
      if (existing) {
        existing.spend = existing.spend.plus(spend);
        existing.batches += 1;
      } else {
        itemAgg.set(b.item.id, {
          id: b.item.id,
          code: b.item.code,
          name: b.item.name,
          spend,
          batches: 1,
        });
      }
    }
    const items = Array.from(itemAgg.values())
      .sort((a, b) => b.spend.cmp(a.spend))
      .map((i) => ({ id: i.id, code: i.code, name: i.name, batches: i.batches }));
    return {
      id: s.id,
      name: s.name,
      phone: s.phone,
      email: s.email,
      batchCount: s.batches.length,
      totalSpend: totalSpend.toFixed(0),
      totalSpendNum: Number(totalSpend),
      lastDelivery,
      items,
    };
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl">Suppliers</h1>
          <p className="text-sm text-muted-foreground">
            Vendors you buy from. Search by name, phone, or email.
          </p>
        </div>
        <SupplierFormDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" />
              Add supplier
            </Button>
          }
        />
      </header>

      <SuppliersListClient suppliers={rows} />
    </div>
  );
}
