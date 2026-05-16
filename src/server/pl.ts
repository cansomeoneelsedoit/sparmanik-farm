import { cache } from "react";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";

export type HarvestPL = {
  revenue: string;
  usageCost: string;
  labourCost: string;
  // Depreciation = sum of amortisedCharge across depreciable HarvestAssets on
  // this harvest. Non-depreciable assets stay in the Fixed Assets ledger and
  // do NOT contribute to the P&L.
  depreciationCost: string;
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
  const [sales, usages, depreciableAssets, wageLines] = await Promise.all([
    prisma.sale.findMany({ where: { harvestId }, select: { amount: true } }),
    prisma.harvestUsage.findMany({
      where: { harvestId },
      select: { consumptions: { select: { qty: true, unitCost: true } } },
    }),
    prisma.harvestAsset.findMany({
      where: { harvestId, depreciable: true },
      select: { amortisedCharge: true },
    }),
    prisma.wageEntryLine.findMany({
      where: { harvestId },
      select: { hours: true, wageEntry: { select: { staffId: true, date: true } } },
    }),
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
  const depreciationCost = (
    depreciableAssets as { amortisedCharge: Decimal | null }[]
  ).reduce(
    (s: Decimal, a) => (a.amortisedCharge ? s.plus(a.amortisedCharge) : s),
    new Decimal(0),
  );

  let labourCost = new Decimal(0);
  for (const line of wageLines as { hours: Decimal; wageEntry: { staffId: string; date: Date } }[]) {
    const rate = await effectiveRate(line.wageEntry.staffId, line.wageEntry.date);
    labourCost = labourCost.plus(new Decimal(line.hours).times(rate));
  }

  const totalCost = usageCost.plus(labourCost).plus(depreciationCost);
  return {
    revenue: revenue.toFixed(4),
    usageCost: usageCost.toFixed(4),
    labourCost: labourCost.toFixed(4),
    depreciationCost: depreciationCost.toFixed(4),
    netProfit: revenue.minus(totalCost).toFixed(4),
  };
});
