import { cache } from "react";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { installDepreciation, type InstallChargeRow } from "@/server/depreciation";

export type HarvestPL = {
  revenue: string;
  usageCost: string;
  labourCost: string;
  // Depreciation = sum of amortisedCharge across depreciable HarvestAssets on
  // this harvest. Non-depreciable assets stay in the Fixed Assets ledger and
  // do NOT contribute to the P&L.
  depreciationCost: string;
  // Misc expenses (contractors, cash payments, etc.) assigned to this
  // harvest via Expense.harvestId.
  expenseCost: string;
  netProfit: string;
};

async function effectiveRate(staffId: string, date: Date): Promise<Decimal> {
  const r = await prisma.staffRate.findFirst({
    where: { staffId, effectiveFrom: { lte: date } },
    orderBy: { effectiveFrom: "desc" },
    select: { rate: true },
  });
  return r ? new Decimal(r.rate) : new Decimal(0);
}

export const getHarvestPL = cache(async (harvestId: string): Promise<HarvestPL> => {
  const [harvest, sales, usages, depreciableAssets, wageLines, expenses] = await Promise.all([
    prisma.harvest.findUnique({
      where: { id: harvestId },
      select: { manualLabourCost: true, endDate: true },
    }),
    prisma.sale.findMany({ where: { harvestId }, select: { amount: true } }),
    prisma.harvestUsage.findMany({
      where: { harvestId },
      select: { consumptions: { select: { qty: true, unitCost: true } } },
    }),
    prisma.harvestAsset.findMany({
      where: { harvestId, depreciable: true },
      select: {
        depreciationMode: true,
        amortisedCharge: true,
        acquisitionCost: true,
        usefulLifeMonths: true,
        date: true,
        returnedAt: true,
      },
    }),
    prisma.wageEntryLine.findMany({
      where: { harvestId },
      select: { hours: true, wageEntry: { select: { staffId: true, date: true } } },
    }),
    prisma.expense.findMany({ where: { harvestId }, select: { amount: true } }),
  ]);

  const revenue = sales.reduce(
    (s: Decimal, x: { amount: Decimal }) => s.plus(x.amount),
    new Decimal(0),
  );
  const usageCost = usages.reduce(
    (s: Decimal, u: { consumptions: { qty: Decimal; unitCost: Decimal }[] }) => {
      const cost = u.consumptions.reduce(
        (cs: Decimal, c) => cs.plus(new Decimal(c.qty).times(c.unitCost)),
        new Decimal(0),
      );
      return s.plus(cost);
    },
    new Decimal(0),
  );
  // Depreciation. PER_USE charges are stored on the install; CALENDAR charges
  // are recomputed live from the in-service window so they accrue over the
  // cycle and are final at close/return (see installDepreciation).
  const harvestEnd = (harvest as { endDate: Date | null } | null)?.endDate ?? null;
  const depreciationCost = (depreciableAssets as InstallChargeRow[]).reduce(
    (s: Decimal, a) => s.plus(installDepreciation(a, harvestEnd)),
    new Decimal(0),
  );

  // Manual override wins: when the harvest has a manualLabourCost set, it
  // REPLACES the computed hours×rate figure (for when reality differs from the
  // logged hours). Otherwise sum the wage lines.
  const manual = (harvest as { manualLabourCost: Decimal | null } | null)?.manualLabourCost ?? null;
  let labourCost = new Decimal(0);
  if (manual !== null) {
    labourCost = new Decimal(manual);
  } else {
    for (const line of wageLines as { hours: Decimal; wageEntry: { staffId: string; date: Date } }[]) {
      const rate = await effectiveRate(line.wageEntry.staffId, line.wageEntry.date);
      labourCost = labourCost.plus(new Decimal(line.hours).times(rate));
    }
  }

  const expenseCost = (expenses as { amount: Decimal }[]).reduce(
    (s: Decimal, e) => s.plus(e.amount),
    new Decimal(0),
  );

  const totalCost = usageCost.plus(labourCost).plus(depreciationCost).plus(expenseCost);
  return {
    revenue: revenue.toFixed(4),
    usageCost: usageCost.toFixed(4),
    labourCost: labourCost.toFixed(4),
    depreciationCost: depreciationCost.toFixed(4),
    expenseCost: expenseCost.toFixed(4),
    netProfit: revenue.minus(totalCost).toFixed(4),
  };
});
