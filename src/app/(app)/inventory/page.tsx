import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  FolderTree,
  Image as ImageIcon,
  Package,
  PackagePlus,
  Plus,
  ScanSearch,
  Upload,
  Wallet,
} from "lucide-react";

import { getLocale } from "next-intl/server";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { cn } from "@/lib/utils";
import { localizedItemName } from "@/lib/item-name";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/shared/money";
import { InventoryFilters } from "@/app/(app)/inventory/inventory-filters";
import { InventoryListClient, type InventoryRow } from "@/app/(app)/inventory/inventory-list-client";
import { InventoryGridClient, type GridRow } from "@/app/(app)/inventory/inventory-grid-client";
import { NewItemDialog } from "@/app/(app)/inventory/new-item-dialog";

export const dynamic = "force-dynamic";

type Sort = "name" | "stock" | "value" | "recent";
type View = "grid" | "list";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; sort?: Sort; view?: View }>;
}) {
  const { q = "", cat = "", sort = "name", view: viewParam } = await searchParams;
  const view: View = viewParam === "list" ? "list" : "grid";
  // English UI shows the concise AI-generated item name; Indonesian shows the
  // original (see src/lib/item-name.ts).
  const locale = await getLocale();

  type ItemRow = {
    id: string;
    code: string;
    name: string;
    nameEn: string | null;
    description: string | null;
    photoPath: string | null;
    unit: string;
    subUnit: string | null;
    subFactor: Decimal | null;
    reorder: Decimal;
    category: { name: string } | null;
    batches: {
      qty: Decimal;
      price: Decimal;
      maxUses: number;
      useCount: number;
      returned: boolean;
      consumptions: { qty: Decimal }[];
    }[];
  };

  const [items, categories, suppliers, familyOptions] = await Promise.all([
    prisma.item.findMany({
      where: {
        AND: [
          // Search hits name OR description OR code OR category name. This
          // fixes the original bug where "seeds" only found 6 items (name
          // match) while "kirin" found many — because the search was
          // name-only and the user wanted a broader match.
          q
            ? {
                OR: [
                  { name: { contains: q, mode: "insensitive" as const } },
                  // English display name too, so searches typed in the
                  // English UI still find items named in Indonesian.
                  { nameEn: { contains: q, mode: "insensitive" as const } },
                  { description: { contains: q, mode: "insensitive" as const } },
                  { code: { contains: q, mode: "insensitive" as const } },
                  {
                    category: {
                      name: { contains: q, mode: "insensitive" as const },
                    },
                  },
                ],
              }
            : {},
          cat ? { category: { name: cat } } : {},
        ],
      },
      // Explicit select — NOT include. Photos live on the row as bytea
      // (photo_data) since migration 20260609010000; `include` would drag
      // every item's blob (~2 MB total) into this query on every page
      // load. Photos are served lazily per-item via /api/items/[id]/photo.
      select: {
        id: true,
        code: true,
        name: true,
        nameEn: true,
        description: true,
        photoPath: true,
        unit: true,
        subUnit: true,
        subFactor: true,
        reorder: true,
        category: { select: { name: true } },
        batches: {
          select: {
            qty: true,
            price: true,
            maxUses: true,
            useCount: true,
            returned: true,
            consumptions: { select: { qty: true } },
          },
        },
      },
      orderBy: sort === "name" ? { name: "asc" } : sort === "recent" ? { createdAt: "desc" } : { name: "asc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    // Distinct product-family tags so the New Item dialog can show an
    // autocomplete datalist — keeps the user from typing "Calnit" three
    // different ways.
    prisma.item
      .groupBy({
        by: ["productFamily"],
        where: { productFamily: { not: null } },
        orderBy: { productFamily: "asc" },
      })
      .then((rows: { productFamily: string | null }[]) =>
        rows.map((r) => r.productFamily).filter((s): s is string => !!s?.trim()),
      ),
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
    // Surface "X / Y uses left" when any batch on the item is reusable.
    // Picks the batch with the most uses-remaining (most representative for
    // a quick at-a-glance check).
    let usesRemaining: number | null = null;
    let usesMax: number | null = null;
    for (const b of item.batches) {
      if (b.maxUses > 1) {
        const r = Math.max(0, b.maxUses - b.useCount);
        if (usesRemaining === null || r > usesRemaining) {
          usesRemaining = r;
          usesMax = b.maxUses;
        }
      }
    }
    return { ...item, stock, value, usesRemaining, usesMax };
  });

  if (sort === "stock") rows.sort((a, b) => a.stock.cmp(b.stock));
  if (sort === "value") rows.sort((a, b) => b.value.cmp(a.value));

  const totalValue = rows.reduce((s: Decimal, r) => s.plus(r.value), new Decimal(0));
  const lowStockCount = rows.filter((r) => {
    const reorder = new Decimal(r.reorder);
    return reorder.gt(0) && r.stock.lte(reorder.times(0.5));
  }).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Track stock, batches, suppliers, and reorder points.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="lg">
            <Link href="/inventory/identify">
              <ScanSearch className="h-4 w-4" /> Identify by photo
            </Link>
          </Button>
          <Button asChild size="lg">
            <Link href="/inventory/receive">
              <PackagePlus className="h-4 w-4" /> Receive stock
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/inventory/import">
              <Upload className="h-4 w-4" /> Import Excel
            </Link>
          </Button>
          <NewItemDialog
            categories={categories.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))}
            suppliers={suppliers.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))}
            familyOptions={familyOptions}
            trigger={
              <Button size="lg" variant="ghost">
                <Plus className="h-4 w-4" /> New item
              </Button>
            }
          />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Boxes className="h-5 w-5" />}
          label="Items tracked"
          value={rows.length.toString()}
          tint="indigo"
        />
        <StatCard
          icon={<Wallet className="h-5 w-5" />}
          label="Total value"
          value={<Money value={totalValue.toFixed(4)} />}
          tint="emerald"
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Low stock"
          value={lowStockCount.toString()}
          sub={lowStockCount === 0 ? "All good" : "Need reordering"}
          tint={lowStockCount > 0 ? "amber" : "muted"}
        />
        <StatCard
          icon={<FolderTree className="h-5 w-5" />}
          label="Categories"
          value={categories.length.toString()}
          tint="slate"
        />
      </div>

      <InventoryFilters categories={categories.map((c: { name: string }) => c.name)} />

      {rows.length === 0 ? (
        <EmptyState hasFilters={!!q || !!cat} />
      ) : view === "grid" ? (
        <InventoryGridClient
          rows={rows.map<GridRow>((r) => {
            const reorder = new Decimal(r.reorder);
            const low = reorder.gt(0) && r.stock.lte(reorder.times(0.5));
            const crit = reorder.gt(0) && r.stock.lte(reorder.times(0.2));
            return {
              id: r.id,
              code: r.code,
              name: localizedItemName(r, locale),
              description: r.description,
              photoPath: r.photoPath,
              unit: r.unit,
              subUnit: r.subUnit ?? null,
              subFactor: r.subFactor ? r.subFactor.toString() : null,
              reorderStr: reorder.toFixed(0),
              stockStr: r.stock.toFixed(0),
              // Pre-format here (server-side) — see CLAUDE.md gotcha #18:
              // importing <Money> into the client grid pulls Prisma into
              // the browser bundle and crashes Turbopack at build time.
              valueFormatted: `Rp ${Number(r.value.toFixed(0)).toLocaleString("id-ID")}`,
              categoryName: r.category?.name ?? null,
              usesRemaining: r.usesRemaining,
              usesMax: r.usesMax,
              low,
              crit,
            };
          })}
        />
      ) : (
        <InventoryListClient
          rows={rows.map<InventoryRow>((r) => {
            const reorder = new Decimal(r.reorder);
            const low = reorder.gt(0) && r.stock.lte(reorder.times(0.5));
            const crit = reorder.gt(0) && r.stock.lte(reorder.times(0.2));
            return {
              id: r.id,
              code: r.code,
              name: localizedItemName(r, locale),
              description: r.description,
              photoPath: r.photoPath,
              unit: r.unit,
              subUnit: r.subUnit ?? null,
              subFactor: r.subFactor ? r.subFactor.toString() : null,
              reorder: reorder.toFixed(0),
              stock: r.stock.toFixed(0),
              // Format on the server (cheap, no extra Prisma calls) so the
              // client component doesn't need to import @/server/money.
              valueFormatted: `Rp ${Number(r.value.toFixed(0)).toLocaleString("id-ID")}`,
              categoryName: r.category?.name ?? null,
              usesRemaining: r.usesRemaining,
              usesMax: r.usesMax,
              low,
              crit,
            };
          })}
        />
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  tint: "indigo" | "emerald" | "amber" | "slate" | "muted";
}) {
  const tints: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", tints[tint])}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="truncate text-xl font-semibold">{value}</div>
          {sub ? <div className="text-[10px] text-muted-foreground">{sub}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Package className="h-7 w-7" />
        </div>
        <div className="font-medium">
          {hasFilters ? "No items match your filters." : "No items yet."}
        </div>
        <div className="max-w-sm text-sm text-muted-foreground">
          {hasFilters
            ? "Try clearing the search or category, or add a new item."
            : "Click “New item” to start tracking what's on the farm."}
        </div>
      </CardContent>
    </Card>
  );
}
