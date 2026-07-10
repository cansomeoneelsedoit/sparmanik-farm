import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getActiveOrgId } from "@/server/org";
import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { listCustomers } from "@/app/(app)/harvest/actions";

import { PosClient } from "./pos-client";

export const dynamic = "force-dynamic";

/**
 * POS "Kasir" register — a full-screen, tablet-first till for selling produce
 * from a live greenhouse cycle. Loads the live cycles + their produce, customers
 * (for find-or-create), in-stock packaging with FIFO cost, recent prices (to
 * pre-fill the keypad), and the exchange rate; the client component holds the
 * cart. Selling routes through the same verified `createSaleTx` as the log-sale
 * dialog (via `recordPosSale`).
 */
export default async function PosPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  // Explicit org guard — this route is outside the (app) layout.
  const orgId = await getActiveOrgId();
  if (!orgId) notFound();

  const [liveHarvests, allProduce, customers, items, setting, recentSales] = await Promise.all([
    prisma.harvest.findMany({
      where: { status: "LIVE" },
      orderBy: { startDate: "desc" },
      include: {
        greenhouse: { select: { name: true } },
        produce: { select: { id: true, name: true } },
        produces: { include: { produce: { select: { id: true, name: true } } } },
      },
    }),
    prisma.produce.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listCustomers(),
    prisma.item.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        unit: true,
        batches: { select: { qty: true, price: true, consumptions: { select: { qty: true } } } },
      },
    }),
    prisma.setting.findFirst(),
    prisma.sale.findMany({
      orderBy: { date: "desc" },
      take: 300,
      select: { produceId: true, grade: true, pricePerKg: true },
    }),
  ]);

  // The org-scoping Prisma extension widens query return types, so annotate the
  // shapes we read (same pattern as the harvest page).
  type HarvestRow = {
    id: string;
    name: string;
    greenhouse: { name: string } | null;
    produce: { id: string; name: string } | null;
    produces: { produce: { id: string; name: string } }[];
  };
  const cycles = (liveHarvests as HarvestRow[]).map((h) => {
    const produces =
      h.produces.length > 0
        ? h.produces.map((hp) => ({ id: hp.produce.id, name: hp.produce.name }))
        : h.produce
          ? [{ id: h.produce.id, name: h.produce.name }]
          : [];
    return { id: h.id, label: `${h.greenhouse?.name ?? "?"} — ${h.name}`, produces };
  });

  // Packaging picker: in-stock items + their FIFO-next unit cost (Rp), mirroring
  // the log-sale dialog's list.
  type BatchRow = { qty: Decimal; price: Decimal; consumptions: { qty: Decimal }[] };
  type ItemRow = { id: string; name: string; unit: string; batches: BatchRow[] };
  const packagingItems = (items as ItemRow[])
    .map((i) => {
      let remaining = new Decimal(0);
      let nextCost: Decimal | null = null;
      for (const b of i.batches) {
        const consumed = b.consumptions.reduce((s, c) => s.plus(c.qty), new Decimal(0));
        const rem = new Decimal(b.qty).minus(consumed);
        if (rem.gt(0)) {
          remaining = remaining.plus(rem);
          if (!nextCost) nextCost = new Decimal(b.price);
        }
      }
      return {
        id: i.id,
        name: i.name,
        unit: i.unit,
        cost: (nextCost ?? new Decimal(0)).toFixed(2),
        available: Number(remaining),
      };
    })
    .filter((i) => i.available > 0)
    .map(({ id, name, unit, cost }) => ({ id, name, unit, cost }));

  // Price defaults: most-recent sale price per produce+grade, to pre-fill the keypad.
  const priceDefaults: Record<string, string> = {};
  for (const s of recentSales as { produceId: string; grade: string; pricePerKg: Decimal }[]) {
    const key = `${s.produceId}:${s.grade}`;
    if (!(key in priceDefaults)) priceDefaults[key] = s.pricePerKg.toFixed(0);
  }

  const exchangeRate = setting?.exchangeRate ? setting.exchangeRate.toFixed(4) : null;

  return (
    <PosClient
      cycles={cycles}
      allProduce={allProduce}
      customers={customers}
      packagingItems={packagingItems}
      exchangeRate={exchangeRate}
      priceDefaults={priceDefaults}
    />
  );
}
