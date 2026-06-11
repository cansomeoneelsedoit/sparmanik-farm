import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import {
  ShoppingListClient,
  type SupplierGroup,
  type ShoppingRow,
} from "@/app/(app)/inventory/shopping-list/shopping-list-client";

export const dynamic = "force-dynamic";

/**
 * Shopping list — every item at or below its reorder level, grouped by
 * supplier so an order is one copy-paste into WhatsApp. The reorder level
 * comes from the item's "Reorder at" field; items without one never appear
 * here (the empty state explains that).
 *
 * Supplier attribution: the item's default supplier wins; otherwise the
 * supplier of the most recent purchase batch; otherwise "no supplier".
 */
export default async function ShoppingListPage() {
  const items = await prisma.item.findMany({
    where: { reorder: { gt: 0 } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      reorder: true,
      defaultSupplier: { select: { id: true, name: true, phone: true } },
      batches: {
        orderBy: { date: "desc" },
        select: {
          qty: true,
          consumptions: { select: { qty: true } },
          supplier: { select: { id: true, name: true, phone: true } },
        },
      },
    },
  });

  type Supplier = { id: string; name: string; phone: string | null };
  type Row = {
    id: string;
    code: string;
    name: string;
    unit: string;
    reorder: Decimal;
    defaultSupplier: Supplier | null;
    batches: {
      qty: Decimal;
      consumptions: { qty: Decimal }[];
      supplier: Supplier | null;
    }[];
  };

  const fmt = (d: Decimal) => d.toFixed(2).replace(/\.?0+$/, "");

  const groups = new Map<string, SupplierGroup>();
  let anyReorderConfigured = false;

  for (const it of items as Row[]) {
    anyReorderConfigured = true;
    const remaining = it.batches.reduce((sum: Decimal, b) => {
      const used = b.consumptions.reduce(
        (s: Decimal, c) => s.plus(c.qty),
        new Decimal(0),
      );
      return sum.plus(new Decimal(b.qty).minus(used));
    }, new Decimal(0));
    const reorder = new Decimal(it.reorder);
    if (remaining.gt(reorder)) continue;

    const tier: ShoppingRow["tier"] = remaining.lte(0)
      ? "out"
      : remaining.lte(reorder.times(0.2))
        ? "critical"
        : remaining.lte(reorder.times(0.5))
          ? "low"
          : "below";

    // Restock back to 2× the reorder level — enough that the next delivery
    // doesn't land already in the warning zone. Whole packs only.
    const suggest = Math.max(
      1,
      Math.ceil(Number(reorder.times(2).minus(remaining))),
    );

    const supplier =
      it.defaultSupplier ?? it.batches.find((b) => b.supplier)?.supplier ?? null;

    const key = supplier?.id ?? "__none__";
    const group =
      groups.get(key) ??
      ({
        id: supplier?.id ?? null,
        name: supplier?.name ?? null,
        phone: supplier?.phone ?? null,
        rows: [],
      } satisfies SupplierGroup);
    group.rows.push({
      id: it.id,
      code: it.code,
      name: it.name?.trim() || it.code,
      unit: it.unit,
      remaining: fmt(remaining),
      reorder: fmt(reorder),
      suggest,
      tier,
    });
    groups.set(key, group);
  }

  const TIER_RANK = { out: 0, critical: 1, low: 2, below: 3 } as const;
  const sorted = [...groups.values()]
    .map((g) => ({
      ...g,
      rows: g.rows.sort(
        (a, b) =>
          TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.name.localeCompare(b.name),
      ),
    }))
    // Named suppliers alphabetically, the "no supplier" bucket last.
    .sort((a, b) => {
      if (a.name === null) return 1;
      if (b.name === null) return -1;
      return a.name.localeCompare(b.name);
    });

  return (
    <ShoppingListClient
      groups={sorted}
      anyReorderConfigured={anyReorderConfigured}
    />
  );
}
