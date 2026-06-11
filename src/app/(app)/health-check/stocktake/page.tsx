import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { StocktakeClient } from "@/app/(app)/health-check/stocktake/stocktake-client";
import { type StocktakeItem } from "@/app/(app)/health-check/stocktake/stocktake-row";

export const dynamic = "force-dynamic";

/**
 * Stock-take wizard. Walks the org's items, captures pack-info + actual
 * on-hand counts for each. Per-item save via the `applyStocktake` server
 * action; pure additive — never deletes anything irreversible.
 *
 * "Done" = item has at least one `inventory.stocktake` audit entry. Used
 * to drop completed items below the un-counted queue so the user always
 * sees the next-thing-to-do at the top.
 */
export default async function StocktakePage() {
  const [items, categories, doneAudits] = await Promise.all([
    prisma.item.findMany({
      orderBy: { name: "asc" },
      // Explicit select — `include` would drag every item's photo_data
      // blob into the wizard load (the walk-the-warehouse page needs to
      // open FAST on a phone). Thumbnails stream lazily per row via
      // /api/items/[id]/photo.
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        subUnit: true,
        subFactor: true,
        categoryId: true,
        photoPath: true,
        batches: {
          select: {
            qty: true,
            consumptions: { select: { qty: true } },
          },
        },
      },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Existing stock-take audit entries → "done" markers.
    prisma.auditAction.findMany({
      where: {
        type: { in: ["inventory.stocktake", "inventory.stocktake_packinfo"] },
      },
      select: { entityId: true },
    }),
  ]);

  const doneSet = new Set(doneAudits.map((a: { entityId: string }) => a.entityId));

  type ItemRow = {
    id: string;
    code: string;
    name: string;
    unit: string;
    subUnit: string | null;
    subFactor: Decimal | null;
    categoryId: string | null;
    photoPath: string | null;
    batches: {
      qty: Decimal;
      consumptions: { qty: Decimal }[];
    }[];
  };

  const rows: StocktakeItem[] = (items as ItemRow[]).map((i) => {
    const currentPacks = i.batches.reduce((sum: Decimal, b) => {
      const consumed = b.consumptions.reduce(
        (s: Decimal, c) => s.plus(c.qty),
        new Decimal(0),
      );
      return sum.plus(new Decimal(b.qty).minus(consumed));
    }, new Decimal(0));

    const subQty =
      i.subFactor && i.subFactor.gt(0) ? currentPacks.times(i.subFactor) : null;

    return {
      id: i.id,
      code: i.code,
      name: i.name,
      unit: i.unit,
      subUnit: i.subUnit,
      subFactor: i.subFactor ? i.subFactor.toString() : null,
      categoryId: i.categoryId ?? null,
      photoPath: i.photoPath ?? null,
      currentPacksStr: currentPacks.toFixed(2),
      currentSubStr: subQty ? subQty.toFixed(0) : currentPacks.toFixed(2),
      done: doneSet.has(i.id),
    };
  });

  return (
    <StocktakeClient
      items={rows}
      categories={categories.map((c: { id: string; name: string }) => ({
        id: c.id,
        name: c.name,
      }))}
    />
  );
}
