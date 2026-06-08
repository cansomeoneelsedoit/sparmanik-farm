import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { Button } from "@/components/ui/button";
import { ReceiveStockClient } from "@/app/(app)/inventory/receive/receive-client";

export const dynamic = "force-dynamic";

export default async function ReceiveStockPage() {
  // Items + suppliers for the pickers, plus their most recent purchase
  // history so the staff sees prior context instead of staring at an empty
  // search box.
  const [items, suppliers, setting, batches] = await Promise.all([
    prisma.item.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        subUnit: true,
        subFactor: true,
      },
    }),
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.setting.findFirst({ select: { exchangeRate: true } }),
    prisma.batch.findMany({
      where: { returned: false, damagedFromHarvestId: null },
      orderBy: { date: "desc" },
      select: {
        itemId: true,
        supplierId: true,
        price: true,
        qty: true,
        date: true,
      },
    }),
  ]);

  const defaultExchangeRate = setting?.exchangeRate.toFixed(2) ?? "1";

  // Compute per-item history: most recent supplier + price.
  type BatchRow = {
    itemId: string;
    supplierId: string | null;
    price: Decimal;
    qty: Decimal;
    date: Date;
  };
  type ItemHistory = {
    lastSupplierId: string | null;
    lastPrice: string;
    lastDate: string;
  };
  const itemHistory: Record<string, ItemHistory> = {};
  // Per-supplier ranked list of items they've previously supplied (newest
  // batch wins, dedup by item so the chip only shows each item once).
  type SupplierChip = {
    itemId: string;
    itemName: string;
    unit: string;
    lastPrice: string;
    lastDate: string;
  };
  const supplierHistory: Record<string, SupplierChip[]> = {};
  const itemById = new Map(
    (items as { id: string; name: string; unit: string; subUnit: string | null; subFactor: Decimal | null }[]).map((i) => [i.id, i]),
  );
  for (const b of batches as BatchRow[]) {
    if (!itemHistory[b.itemId]) {
      itemHistory[b.itemId] = {
        lastSupplierId: b.supplierId,
        lastPrice: new Decimal(b.price).toFixed(2),
        lastDate: b.date.toISOString().slice(0, 10),
      };
    }
    if (b.supplierId) {
      const list = (supplierHistory[b.supplierId] ??= []);
      if (!list.some((c) => c.itemId === b.itemId)) {
        const it = itemById.get(b.itemId);
        if (it) {
          list.push({
            itemId: b.itemId,
            itemName: it.name,
            unit: it.unit,
            lastPrice: new Decimal(b.price).toFixed(2),
            lastDate: b.date.toISOString().slice(0, 10),
          });
        }
      }
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/inventory">
            <ArrowLeft className="h-4 w-4" /> Inventory
          </Link>
        </Button>
        <div>
          <h1 className="font-serif text-3xl">Receive stock</h1>
          <p className="text-sm text-muted-foreground">
            Pick the supplier and date once, then add every item from that
            invoice. Reusable items (rockwool, grow bags) come back from a
            greenhouse — tick the toggle.
          </p>
        </div>
      </header>

      <ReceiveStockClient
        items={(items as { id: string; name: string; unit: string; subUnit: string | null; subFactor: Decimal | null }[]).map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          subUnit: i.subUnit,
          subFactor: i.subFactor ? Number(i.subFactor) : null,
        }))}
        suppliers={(suppliers as { id: string; name: string }[]).map((s) => ({ id: s.id, name: s.name }))}
        defaultExchangeRate={defaultExchangeRate}
        itemHistory={itemHistory}
        supplierHistory={supplierHistory}
      />
    </div>
  );
}
