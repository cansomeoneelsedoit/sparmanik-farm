import Link from "next/link";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { getHarvestPL } from "@/server/pl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/shared/money";

export const dynamic = "force-dynamic";

type WageLineRow = {
  hours: Decimal;
  wageEntry: { staffId: string; date: Date };
};

type StaffRateRow = { staffId: string; effectiveFrom: Date; rate: Decimal };

/**
 * Lookup a staff member's effective wage rate at a given date from a
 * pre-loaded list. Replaces the previous one-query-per-wage-line loop
 * (N+1) — for orgs with months of payroll data that was the dominant
 * cost of rendering this page.
 */
function effectiveRateFromCache(
  cache: Map<string, StaffRateRow[]>,
  staffId: string,
  date: Date,
): Decimal {
  const rates = cache.get(staffId) ?? [];
  // rates is sorted desc by effectiveFrom; first match wins.
  const r = rates.find((x) => x.effectiveFrom <= date);
  return r ? new Decimal(r.rate) : new Decimal(0);
}

export default async function FinancialsPage() {
  // --- Revenue: every Sale.amount. ---
  const sales = await prisma.sale.findMany({ select: { amount: true } });
  const revenue = sales.reduce(
    (s: Decimal, x: { amount: Decimal }) => s.plus(x.amount),
    new Decimal(0),
  );

  // --- COGS (accrual): cost of inventory ACTUALLY CONSUMED.
  // Sum BatchConsumption.qty * unitCost across the whole business. This is
  // exactly what flows into per-harvest usage costs, so the harvest sum lines
  // up cleanly with this figure — no double-count with depreciation below.
  const consumptions = await prisma.batchConsumption.findMany({
    select: { qty: true, unitCost: true },
  });
  const cogsConsumed = consumptions.reduce(
    (s: Decimal, c: { qty: Decimal; unitCost: Decimal }) =>
      s.plus(new Decimal(c.qty).times(c.unitCost)),
    new Decimal(0),
  );

  // --- Balance sheet (informational) — stock on hand at current FIFO.
  // Not subtracted from net; just shows what's still in inventory.
  const liveBatches = await prisma.batch.findMany({
    where: { returned: false, damagedFromHarvestId: null },
    select: { qty: true, price: true, consumptions: { select: { qty: true } } },
  });
  const stockOnHand = liveBatches.reduce(
    (s: Decimal, b: { qty: Decimal; price: Decimal; consumptions: { qty: Decimal }[] }) => {
      const consumed = b.consumptions.reduce(
        (cs: Decimal, c: { qty: Decimal }) => cs.plus(c.qty),
        new Decimal(0),
      );
      const remaining = new Decimal(b.qty).minus(consumed);
      return s.plus(remaining.times(b.price));
    },
    new Decimal(0),
  );

  // --- Total wages: every WageEntryLine's hours × effective rate. ---
  // Pre-load every staff rate once and index by staffId. Avoids the N+1
  // "look up the rate for this line, then the next, then the next" loop
  // that dominated this page's render time on orgs with months of data.
  const [allRates, wageLines, allocatedLines] = await Promise.all([
    prisma.staffRate.findMany({
      orderBy: { effectiveFrom: "desc" },
      select: { staffId: true, rate: true, effectiveFrom: true },
    }),
    prisma.wageEntryLine.findMany({
      select: {
        hours: true,
        harvestId: true,
        wageEntry: { select: { staffId: true, date: true } },
      },
    }) as Promise<(WageLineRow & { harvestId: string | null })[]>,
    prisma.wageEntryLine.findMany({
      where: { harvestId: { not: null } },
      select: {
        hours: true,
        wageEntry: { select: { staffId: true, date: true } },
      },
    }) as Promise<WageLineRow[]>,
  ]);
  const rateCache = new Map<string, StaffRateRow[]>();
  for (const r of allRates as StaffRateRow[]) {
    const list = rateCache.get(r.staffId) ?? [];
    list.push(r);
    rateCache.set(r.staffId, list);
  }
  let totalWages = new Decimal(0);
  let harvestAllocatedWages = new Decimal(0);
  for (const l of wageLines) {
    const rate = effectiveRateFromCache(rateCache, l.wageEntry.staffId, l.wageEntry.date);
    totalWages = totalWages.plus(new Decimal(l.hours).times(rate));
  }
  for (const l of allocatedLines) {
    const rate = effectiveRateFromCache(rateCache, l.wageEntry.staffId, l.wageEntry.date);
    harvestAllocatedWages = harvestAllocatedWages.plus(
      new Decimal(l.hours).times(rate),
    );
  }
  const unallocatedWages = totalWages.minus(harvestAllocatedWages);

  // --- Depreciation: amortised charges on depreciable HarvestAssets. ---
  const assets = await prisma.harvestAsset.findMany({
    where: { depreciable: true },
    select: { amortisedCharge: true },
  });
  const depreciation = (assets as { amortisedCharge: Decimal | null }[]).reduce(
    (s: Decimal, a) => (a.amortisedCharge ? s.plus(a.amortisedCharge) : s),
    new Decimal(0),
  );

  // --- Misc expenses (contractors, cash payments, utilities). Total across
  // the whole business; the per-harvest share is already baked into each
  // harvest P&L via getHarvestPL.
  const allExpenses = await prisma.expense.findMany({
    select: { amount: true, harvestId: true },
  });
  type ExpenseRowLite = { amount: Decimal; harvestId: string | null };
  const totalExpenses = (allExpenses as ExpenseRowLite[]).reduce(
    (s: Decimal, e) => s.plus(e.amount),
    new Decimal(0),
  );
  const overheadExpenses = (allExpenses as ExpenseRowLite[])
    .filter((e) => !e.harvestId)
    .reduce((s: Decimal, e) => s.plus(e.amount), new Decimal(0));
  const harvestAllocatedExpenses = totalExpenses.minus(overheadExpenses);

  // --- Damage losses: residual value of reusable assets that came back
  // damaged or lost. The business already paid the cash at purchase, but
  // because the asset can no longer be used, the unrecovered amortisation
  // (remaining_uses × per_use_cost × qty) is a write-off the business
  // absorbs (NOT charged to the harvest that broke it). Each row is
  // linked to the offending cycle for the audit trail.
  type DamagedAsset = {
    id: string;
    qty: Decimal;
    maxUses: number;
    useCount: number;
    returnCondition: string | null;
    returnNote: string | null;
    item: { name: string };
    harvest: { id: string; name: string };
    consumptions: { batch: { amortisedCostPerUse: Decimal | null } }[];
  };
  const damagedAssets = (await prisma.harvestAsset.findMany({
    where: { returnCondition: { in: ["damaged", "lost"] } },
    select: {
      id: true,
      qty: true,
      maxUses: true,
      useCount: true,
      returnCondition: true,
      returnNote: true,
      item: { select: { name: true } },
      harvest: { select: { id: true, name: true } },
      consumptions: { select: { batch: { select: { amortisedCostPerUse: true } } } },
    },
  })) as DamagedAsset[];
  const damageRows = damagedAssets.map((a) => {
    const perUse = a.consumptions[0]?.batch.amortisedCostPerUse
      ? new Decimal(a.consumptions[0].batch.amortisedCostPerUse)
      : new Decimal(0);
    const remainingUses = Math.max(0, a.maxUses - a.useCount);
    const residual = perUse.times(remainingUses).times(new Decimal(a.qty));
    return { ...a, residual };
  });
  const damageLosses = damageRows.reduce(
    (s: Decimal, r) => s.plus(r.residual),
    new Decimal(0),
  );

  // --- Net (accrual, no double count).
  const totalCosts = cogsConsumed
    .plus(totalWages)
    .plus(depreciation)
    .plus(damageLosses)
    .plus(totalExpenses);
  const net = revenue.minus(totalCosts);

  // --- Per-harvest P&L roll-up ---
  const harvests = await prisma.harvest.findMany({
    orderBy: [{ endDate: "desc" }, { startDate: "desc" }],
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      greenhouse: { select: { name: true } },
    },
  });
  type HarvestRow = (typeof harvests)[number];
  const harvestPls = await Promise.all(
    harvests.map(async (h: HarvestRow) => ({ ...h, pl: await getHarvestPL(h.id) })),
  );

  const sumD = (vals: string[]) =>
    vals.reduce((s: Decimal, v) => s.plus(new Decimal(v)), new Decimal(0));
  const sumHarvestRevenue = sumD(harvestPls.map((h) => h.pl.revenue));
  const sumHarvestUsage = sumD(harvestPls.map((h) => h.pl.usageCost));
  const sumHarvestLabour = sumD(harvestPls.map((h) => h.pl.labourCost));
  const sumHarvestDepr = sumD(harvestPls.map((h) => h.pl.depreciationCost));
  const sumHarvestNet = sumD(harvestPls.map((h) => h.pl.netProfit));

  // Reconciliation deltas (accrual basis — clean tie-out).
  const otherRevenue = revenue.minus(sumHarvestRevenue);            // sales without a cycle
  const adhocUsage = cogsConsumed.minus(sumHarvestUsage);           // consumption not via a cycle
  const generalFarmWages = totalWages.minus(sumHarvestLabour);     // wages not allocated to a cycle
  const depreciationDelta = depreciation.minus(sumHarvestDepr);    // sanity, should be ~0

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">Financials</h1>

      <div className="grid gap-4 md:grid-cols-5">
        <Stat label="Revenue" value={revenue.toFixed(4)} colour="green" />
        <Stat label="COGS consumed" value={cogsConsumed.toFixed(4)} colour="red" />
        <Stat label="Wages" value={totalWages.toFixed(4)} colour="red" />
        <Stat label="Depreciation" value={depreciation.toFixed(4)} colour="red" />
        <Stat
          label="Net P&L"
          value={net.toFixed(4)}
          colour={net.gte(0) ? "green" : "red"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profit &amp; Loss statement (accrual)</CardTitle>
          <p className="pt-1 text-xs text-muted-foreground">
            Costs are recognised when inventory is consumed (not at purchase),
            so this number ties out cleanly with the sum of harvest P&amp;Ls.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 p-6 text-sm">
          <Row label="Revenue (sales across all greenhouses)" value={revenue.toFixed(4)} positive />
          <Section title="Cost of goods sold">
            <Row
              label="Inventory consumed (Σ FIFO consumption cost)"
              value={cogsConsumed.toFixed(4)}
              negative
            />
          </Section>
          <Section title="Wages">
            <Row
              label="Allocated to harvests"
              value={harvestAllocatedWages.toFixed(4)}
              negative
              indent
            />
            <Row
              label="General farm work (not on a specific harvest)"
              value={unallocatedWages.toFixed(4)}
              negative
              indent
            />
            <Row label="Total wages" value={totalWages.toFixed(4)} negative bold />
          </Section>
          <Section title="Depreciation">
            <Row
              label="Amortised assets (per-use share)"
              value={depreciation.toFixed(4)}
              negative
            />
          </Section>
          {damageLosses.gt(0) ? (
            <Section title="Damage losses (business absorbs)">
              <Row
                label="Reusable assets damaged or lost (residual value)"
                value={damageLosses.toFixed(4)}
                negative
              />
            </Section>
          ) : null}
          {totalExpenses.gt(0) ? (
            <Section title="Misc expenses (contractors, utilities, etc.)">
              <Row
                label="Allocated to harvests"
                value={harvestAllocatedExpenses.toFixed(4)}
                negative
                indent
              />
              <Row
                label="Business overhead (not on a specific harvest)"
                value={overheadExpenses.toFixed(4)}
                negative
                indent
              />
              <Row label="Total misc expenses" value={totalExpenses.toFixed(4)} negative bold />
            </Section>
          ) : null}
          <div className="my-2 border-t" />
          <Row label="Net Profit / Loss" value={net.toFixed(4)} bold positive={net.gte(0)} negative={net.lt(0)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Harvest contributions</CardTitle>
          <p className="pt-1 text-xs text-muted-foreground">
            Each harvest&apos;s own operational P&amp;L (revenue − FIFO usage − allocated labour − depreciation share).
            The reconciliation card below ties these back to the main business P&amp;L.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {harvestPls.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No harvests yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Harvest</th>
                    <th className="px-2 py-2 text-left font-medium">Status</th>
                    <th className="px-2 py-2 text-right font-medium">Revenue</th>
                    <th className="px-2 py-2 text-right font-medium">FIFO usage</th>
                    <th className="px-2 py-2 text-right font-medium">Labour</th>
                    <th className="px-2 py-2 text-right font-medium">Depreciation</th>
                    <th className="px-4 py-2 text-right font-medium">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {harvestPls.map((h) => {
                    const netD = new Decimal(h.pl.netProfit);
                    return (
                      <tr key={h.id} className="border-t hover:bg-muted/20">
                        <td className="px-4 py-2">
                          <Link
                            href={`/harvest/${h.id}`}
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {h.name}
                          </Link>
                          {h.greenhouse?.name ? (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              · {h.greenhouse.name}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {h.endDate ? (
                            <span className="text-muted-foreground">Closed</span>
                          ) : (
                            <span className="font-medium text-green-600">Active</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Money value={h.pl.revenue} />
                        </td>
                        <td className="px-2 py-2 text-right text-red-600">
                          <Money value={h.pl.usageCost} />
                        </td>
                        <td className="px-2 py-2 text-right text-red-600">
                          <Money value={h.pl.labourCost} />
                        </td>
                        <td className="px-2 py-2 text-right text-red-600">
                          <Money value={h.pl.depreciationCost} />
                        </td>
                        <td
                          className={`px-4 py-2 text-right font-medium ${netD.gte(0) ? "text-green-600" : "text-red-600"}`}
                        >
                          <Money value={h.pl.netProfit} />
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="px-4 py-2" colSpan={2}>
                      Sum of harvest contributions
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Money value={sumHarvestRevenue.toFixed(4)} />
                    </td>
                    <td className="px-2 py-2 text-right text-red-600">
                      <Money value={sumHarvestUsage.toFixed(4)} />
                    </td>
                    <td className="px-2 py-2 text-right text-red-600">
                      <Money value={sumHarvestLabour.toFixed(4)} />
                    </td>
                    <td className="px-2 py-2 text-right text-red-600">
                      <Money value={sumHarvestDepr.toFixed(4)} />
                    </td>
                    <td
                      className={`px-4 py-2 text-right ${sumHarvestNet.gte(0) ? "text-green-600" : "text-red-600"}`}
                    >
                      <Money value={sumHarvestNet.toFixed(4)} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {damageRows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Damage losses</CardTitle>
            <p className="pt-1 text-xs text-muted-foreground">
              Reusable assets that came back damaged or lost. Residual value
              is the cash the business absorbs (the offending harvest&apos;s
              P&amp;L is unchanged — only what it actually used while alive).
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Item</th>
                    <th className="px-2 py-2 text-left font-medium">Cycle</th>
                    <th className="px-2 py-2 text-left font-medium">Condition</th>
                    <th className="px-2 py-2 text-left font-medium">Note</th>
                    <th className="px-2 py-2 text-right font-medium">Qty</th>
                    <th className="px-4 py-2 text-right font-medium">Residual loss</th>
                  </tr>
                </thead>
                <tbody>
                  {damageRows.map((d) => (
                    <tr key={d.id} className="border-t">
                      <td className="px-4 py-2">{d.item.name}</td>
                      <td className="px-2 py-2 text-xs">
                        <Link
                          href={`/harvest/${d.harvest.id}`}
                          className="text-muted-foreground hover:underline"
                        >
                          {d.harvest.name}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-xs">
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                          {d.returnCondition}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">{d.returnNote ?? "—"}</td>
                      <td className="px-2 py-2 text-right">{Number(d.qty)}</td>
                      <td className="px-4 py-2 text-right font-medium text-red-600">
                        <Money value={d.residual.toFixed(4)} />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="px-4 py-2" colSpan={5}>Total damage losses</td>
                    <td className="px-4 py-2 text-right text-red-600">
                      <Money value={damageLosses.toFixed(4)} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Reconciliation: harvest contributions → business P&amp;L</CardTitle>
          <p className="pt-1 text-xs text-muted-foreground">
            Δ should be zero. Each line is a real cost or revenue the
            harvest view doesn&apos;t see.
          </p>
        </CardHeader>
        <CardContent className="space-y-2 p-6 text-sm">
          <Row
            label="Sum of harvest net P&L (from table)"
            value={sumHarvestNet.toFixed(4)}
            positive={sumHarvestNet.gte(0)}
            negative={sumHarvestNet.lt(0)}
          />
          <Row
            label="+ Sales not assigned to any harvest"
            value={otherRevenue.toFixed(4)}
            indent
            positive={otherRevenue.gt(0)}
            negative={otherRevenue.lt(0)}
          />
          {adhocUsage.abs().gte(new Decimal("0.0001")) ? (
            <Row
              label="− Inventory consumed off-harvest (ad-hoc use)"
              value={adhocUsage.toFixed(4)}
              indent
              negative={adhocUsage.gt(0)}
            />
          ) : null}
          <Row
            label="− General farm wages (not on a harvest)"
            value={generalFarmWages.toFixed(4)}
            indent
            negative={generalFarmWages.gt(0)}
          />
          {damageLosses.gt(0) ? (
            <Row
              label="− Damage losses (business absorbs)"
              value={damageLosses.toFixed(4)}
              indent
              negative
            />
          ) : null}
          {depreciationDelta.abs().gte(new Decimal("0.0001")) ? (
            <Row
              label="± Depreciation gap (should be 0)"
              value={depreciationDelta.toFixed(4)}
              indent
              negative={depreciationDelta.gt(0)}
              positive={depreciationDelta.lt(0)}
            />
          ) : null}
          <div className="my-2 border-t" />
          <Row
            label="= Business Net P&L"
            value={net.toFixed(4)}
            bold
            positive={net.gte(0)}
            negative={net.lt(0)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Balance sheet (informational)</CardTitle>
          <p className="pt-1 text-xs text-muted-foreground">
            What&apos;s still owned by the business. Not part of the P&amp;L
            above; just the snapshot value of the inventory pool.
          </p>
        </CardHeader>
        <CardContent className="space-y-2 p-6 text-sm">
          <Row
            label="Stock on hand (Σ remaining qty × FIFO unit cost)"
            value={stockOnHand.toFixed(4)}
            positive
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, colour }: { label: string; value: string; colour: "green" | "red" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold ${colour === "green" ? "text-green-600" : "text-red-600"}`}>
          <Money value={value} />
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  positive,
  negative,
  bold,
  indent,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
  bold?: boolean;
  indent?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${indent ? "pl-3" : ""} ${bold ? "border-t pt-2 font-semibold" : ""}`}
    >
      <span className={indent ? "text-muted-foreground" : ""}>{label}</span>
      <span className={positive ? "text-green-600" : negative ? "text-red-600" : ""}>
        <Money value={value} />
      </span>
    </div>
  );
}
