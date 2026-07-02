import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";

import { prisma } from "@/server/prisma";
import { getHarvestPL } from "@/server/pl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money, MoneyDual } from "@/components/shared/money";
import { Decimal } from "@/server/decimal";
import { RecordUsageDialog } from "@/app/(app)/harvest/[harvestId]/record-usage-dialog";
import {
  InstallAssetDialog,
  type InstallAssetItem,
} from "@/app/(app)/harvest/[harvestId]/install-asset-dialog";
import { LogSaleDialog } from "@/app/(app)/harvest/[harvestId]/log-sale-dialog";
import { LogDispositionDialog } from "@/app/(app)/harvest/[harvestId]/log-disposition-dialog";
import { LogLabourDialog } from "@/app/(app)/harvest/[harvestId]/log-labour-dialog";
import { CheckInAssetDialog } from "@/app/(app)/harvest/[harvestId]/check-in-asset-dialog";
import { ExpenseFormDialog } from "@/app/(app)/expenses/expense-form-dialog";
import { ImportExpenseSheetDialog } from "@/app/(app)/expenses/import-expense-sheet-dialog";
import { EndHarvestButton } from "@/app/(app)/harvest/[harvestId]/end-harvest-button";
import { StartHarvestDialog } from "@/app/(app)/harvest/start-harvest-dialog";
import { DeleteHarvestButton } from "@/app/(app)/harvest/[harvestId]/harvest-actions";
import {
  DeleteSaleButton,
  DeleteUsageButton,
  DeleteLabourButton,
  DeleteDispositionButton,
} from "@/app/(app)/harvest/[harvestId]/row-actions";

export const dynamic = "force-dynamic";

export default async function HarvestDetailPage({ params }: { params: Promise<{ harvestId: string }> }) {
  const { harvestId } = await params;
  const [harvest, items, produces, greenhouses, staffRows, harvestExpenses, labourTasks, customers] = await Promise.all([
    // findFirst (not findUnique) so the prisma extension can safely append
    // an `organizationId` predicate for org isolation — findUnique rejects
    // non-unique fields in its where.
    prisma.harvest.findFirst({
      where: { id: harvestId },
      include: {
        greenhouse: true,
        produce: true,
        produces: { include: { produce: true }, orderBy: { createdAt: "asc" } },
        sales: { orderBy: { date: "desc" }, include: { produce: true, customer: true } },
        dispositions: { orderBy: { date: "desc" }, include: { produce: true, staff: true, customer: true } },
        usages: { orderBy: { date: "desc" }, include: { item: { select: { id: true, name: true, unit: true, subUnit: true, subFactor: true } }, consumptions: true } },
        assets: { orderBy: { date: "desc" }, include: { item: { select: { id: true, name: true, unit: true, subUnit: true, subFactor: true } }, consumptions: true } },
      },
    }),
    prisma.item.findMany({
      orderBy: { name: "asc" },
      // subUnit + subFactor (e.g. "metres" + 500) drive the pack-style
      // install UX. price is per-batch, used by the install dialog's cost
      // preview to charge proportional cost when only a fraction of the
      // pack is installed. Explicit select keeps the photo_data blobs out
      // of this query — this page only needs names + stock math.
      select: {
        id: true,
        name: true,
        unit: true,
        subUnit: true,
        subFactor: true,
        batches: {
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            qty: true,
            price: true,
            maxUses: true,
            useCount: true,
            amortisedCostPerUse: true,
            consumptions: { select: { qty: true } },
          },
        },
      },
    }),
    prisma.produce.findMany({ orderBy: { name: "asc" } }),
    prisma.greenhouse.findMany({ orderBy: { name: "asc" } }),
    prisma.staff.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        rates: {
          orderBy: { effectiveFrom: "desc" },
          take: 1,
          select: { rate: true },
        },
      },
    }),
    prisma.expense.findMany({
      where: { harvestId },
      orderBy: { date: "desc" },
    }),
    prisma.labourTask.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true },
    }),
  ]);

  type HarvestExpense = {
    id: string;
    date: Date;
    amount: Decimal;
    category: string | null;
    payee: string;
    description: string | null;
    paymentMethod: string | null;
  };
  const expenseRows = harvestExpenses as HarvestExpense[];

  type StaffWithRate = { id: string; name: string; rates: { rate: Decimal }[] };
  const staffForDialog = (staffRows as StaffWithRate[]).map((s) => ({
    id: s.id,
    name: s.name,
    rate: s.rates[0] ? new Decimal(s.rates[0].rate).toFixed(2) : null,
  }));

  if (!harvest) notFound();

  // Normalise the harvest's produces from the join table; fall back to the
  // legacy single produce field if the join table is empty (e.g. older
  // harvests created before the multi-produce migration).
  type JoinedProduce = { produce: { id: string; name: string } };
  const joinedProduces = (harvest.produces as JoinedProduce[]) ?? [];
  const harvestProduceList: { id: string; name: string }[] =
    joinedProduces.length > 0
      ? joinedProduces.map((p) => ({ id: p.produce.id, name: p.produce.name }))
      : harvest.produce
        ? [{ id: harvest.produce.id, name: harvest.produce.name }]
        : [];

  const pl = await getHarvestPL(harvest.id);
  // Must include misc expenses (pl.expenseCost) — netProfit already subtracts
  // them, so leaving them out made "Total expenses" ≠ "Net profit" on the same
  // card whenever a cycle had a contractor/cash expense (app review #12).
  const totalExpenses = (
    Number(pl.usageCost) +
    Number(pl.labourCost) +
    Number(pl.depreciationCost) +
    Number(pl.expenseCost)
  ).toFixed(4);

  // Labour lines for this harvest — resolves rates via effective-from history
  const labourLines = await prisma.wageEntryLine.findMany({
    where: { harvestId: harvest.id },
    include: {
      wageEntry: {
        select: {
          date: true,
          staff: {
            select: {
              id: true,
              name: true,
              rates: { orderBy: { effectiveFrom: "desc" }, select: { rate: true, effectiveFrom: true } },
            },
          },
        },
      },
    },
  });
  type LabourLine = {
    id: string;
    hours: Decimal;
    task: string | null;
    wageEntry: {
      date: Date;
      staff: { id: string; name: string; rates: { rate: Decimal; effectiveFrom: Date }[] };
    };
  };
  function effectiveRate(line: LabourLine): Decimal {
    const wageDate = line.wageEntry.date;
    const r = line.wageEntry.staff.rates.find((rate: { rate: Decimal; effectiveFrom: Date }) => rate.effectiveFrom <= wageDate);
    return r ? new Decimal(r.rate) : new Decimal(0);
  }
  const labourRows = (labourLines as LabourLine[]).map((l) => {
    const rate = effectiveRate(l);
    const cost = new Decimal(l.hours).times(rate);
    return { id: l.id, date: l.wageEntry.date, name: l.wageEntry.staff.name, hours: new Decimal(l.hours), rate, cost, task: l.task };
  });

  type AssetRow = {
    id: string;
    date: Date;
    item: { name: string; unit: string; subUnit: string | null; subFactor: Decimal | null };
    qty: Decimal;
    reusable: boolean;
    condition: string | null;
    depreciable: boolean;
    amortisedCharge: Decimal | null;
    maxUses: number;
    useCount: number;
    discarded: boolean;
    returnCondition: string | null;
    returnedAt: Date | null;
    returnNote: string | null;
    consumptions: { qty: Decimal; unitCost: Decimal }[];
  };
  /** Render an asset's qty in the user's preferred unit. For pack-style
   *  items (`subFactor` set) we display the install in sub-units so "50
   *  metres" reads naturally instead of "0.1 rolls". */
  function fmtAssetQty(a: AssetRow): string {
    if (a.item.subFactor && a.item.subUnit) {
      const subQty = new Decimal(a.qty).times(a.item.subFactor);
      return `${Number(subQty)} ${a.item.subUnit}`;
    }
    return `${Number(a.qty)} ${a.item.unit}`;
  }
  /** Per-unit price of an asset line (charge ÷ quantity in real units), so
   *  the table reads "300 metres · Rp X / metre". Null when there's no charge
   *  or qty to divide. */
  function assetPerUnit(a: AssetRow): { value: string; label: string } | null {
    const charge = a.amortisedCharge ? new Decimal(a.amortisedCharge) : null;
    if (!charge || charge.lte(0)) return null;
    const subQty =
      a.item.subFactor && a.item.subUnit
        ? new Decimal(a.qty).times(a.item.subFactor)
        : new Decimal(a.qty);
    if (subQty.lte(0)) return null;
    const label = a.item.subFactor && a.item.subUnit ? a.item.subUnit : a.item.unit;
    return { value: charge.div(subQty).toFixed(4), label };
  }
  const assetRows = (harvest.assets as AssetRow[]).map((a) => {
    const fifoCost = a.consumptions.reduce(
      (s: Decimal, c) => s.plus(new Decimal(c.qty).times(c.unitCost)),
      new Decimal(0),
    );
    return { ...a, fifoCost };
  });
  const depreciableAssets = assetRows.filter((a) => a.depreciable);
  const fixedAssets = assetRows.filter((a) => !a.depreciable);

  // Per-section column totals shown in each table's footer row. Money totals
  // reuse the P&L figures so the footer always matches the stat cards above.
  const salesWeightTotal = Math.round((harvest.sales as { weight: Decimal }[]).reduce((s, x) => s + Number(x.weight), 0) * 1000) / 1000;
  // Total discount given = Σ max(0, list − charged) across this harvest's sales.
  const salesDiscountTotal = (harvest.sales as { weight: Decimal; pricePerKg: Decimal; amount: Decimal }[]).reduce(
    (s, x) => {
      const d = Number(x.weight) * Number(x.pricePerKg) - Number(x.amount);
      return s + (d > 0 ? d : 0);
    },
    0,
  );
  const labourHoursTotal = labourRows.reduce((s, l) => s + Number(l.hours), 0);
  const deprFullTotal = depreciableAssets.reduce((s, a) => s.plus(a.fifoCost), new Decimal(0));
  const fixedFifoTotal = fixedAssets.reduce((s, a) => s.plus(a.fifoCost), new Decimal(0));

  // --- Dispositions: non-sale fates of the produce (breakage / spillage,
  // staff consumption, giveaways / samples). Weight-only by design; the
  // optional pricePerKg is a memo value that never enters the P&L. These let
  // total yield reconcile: grown = sold + breakage + staff + giveaways.
  type DispositionRow = {
    id: string;
    date: Date;
    type: "BREAKAGE" | "STAFF" | "GIVEAWAY";
    produceId: string;
    produce: { name: string };
    staffId: string | null;
    staff: { name: string } | null;
    customerId: string | null;
    customer: { name: string } | null;
    weight: Decimal;
    pricePerKg: Decimal | null;
    note: string | null;
  };
  const dispositionRows = (harvest.dispositions as DispositionRow[]) ?? [];
  const breakageRows = dispositionRows.filter((d) => d.type === "BREAKAGE");
  const staffEatRows = dispositionRows.filter((d) => d.type === "STAFF");
  const giveawayRows = dispositionRows.filter((d) => d.type === "GIVEAWAY");
  const kgSum = (rows: DispositionRow[]) =>
    Math.round(rows.reduce((s, d) => s + Number(d.weight), 0) * 1000) / 1000;
  const memoSum = (rows: DispositionRow[]) =>
    rows.reduce((s, d) => s + (d.pricePerKg ? Number(d.weight) * Number(d.pricePerKg) : 0), 0);
  const breakageKg = kgSum(breakageRows);
  const staffKg = kgSum(staffEatRows);
  const giveawayKg = kgSum(giveawayRows);
  // How much this greenhouse actually grew.
  const totalGrownKg =
    Math.round((salesWeightTotal + breakageKg + staffKg + giveawayKg) * 1000) / 1000;
  const yieldPct = (kg: number) =>
    totalGrownKg > 0 ? Math.round((kg / totalGrownKg) * 1000) / 10 : 0;

  // --- Build the item list passed to InstallAssetDialog ---
  // For each item we compute total available stock and surface the FIFO-top
  // batch's depreciation snapshot so the dialog can render the per-use charge
  // preview before the user submits.
  type ItemWithBatches = {
    id: string;
    name: string;
    unit: string;
    subUnit: string | null;
    subFactor: Decimal | null;
    batches: {
      id: string;
      qty: Decimal;
      price: Decimal;
      maxUses: number;
      useCount: number;
      amortisedCostPerUse: Decimal | null;
      consumptions: { qty: Decimal }[];
    }[];
  };
  const installItems: InstallAssetItem[] = (items as ItemWithBatches[])
    .map((i) => {
      let available = new Decimal(0);
      let topBatch: InstallAssetItem["topBatch"] = null;
      let topBatchUnitPrice: string | null = null;
      for (const b of i.batches) {
        const consumed = b.consumptions.reduce(
          (s: Decimal, c) => s.plus(c.qty),
          new Decimal(0),
        );
        const rem = new Decimal(b.qty).minus(consumed);
        if (rem.lte(0)) continue;
        if (!topBatch) {
          topBatch = {
            maxUses: b.maxUses ?? 1,
            useCount: b.useCount ?? 0,
            amortisedCostPerUse: b.amortisedCostPerUse
              ? new Decimal(b.amortisedCostPerUse).toFixed(4)
              : null,
          };
          // Batch.price is per-unit (per pack) system-wide — consumeFifo uses it
          // directly as unit cost, and totalValue multiplies remaining × price.
          // Do NOT divide by qty here (that treated it as a batch total and made
          // the install cost preview understate the real charge — app review #14).
          topBatchUnitPrice = new Decimal(b.price).toFixed(4);
        }
        available = available.plus(rem);
      }
      return {
        id: i.id,
        name: i.name,
        unit: i.unit,
        subUnit: i.subUnit,
        subFactor: i.subFactor ? Number(i.subFactor) : null,
        topBatchUnitPrice,
        available: Number(available),
        topBatch,
      };
    })
    .filter((i) => i.available > 0);

  // Packaging picker for Log-sale: every in-stock item + its FIFO-next unit
  // cost (the price the next consumed unit costs). Batch.price is per-unit, so
  // we take the oldest remaining batch's price directly (not price/qty).
  const packagingItems = (items as ItemWithBatches[])
    .map((i) => {
      let remaining = new Decimal(0);
      let nextCost: Decimal | null = null;
      for (const b of i.batches) {
        const consumed = b.consumptions.reduce((s: Decimal, c) => s.plus(c.qty), new Decimal(0));
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

  // One renderer for all three disposition sections — same shape, with an
  // optional "party" column (which staff ate it / who got the sample).
  const dispoProduces = produces.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
  const dispoCustomers = (customers as { id: string; name: string; type: string }[]).map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
  }));
  const dispoCard = (
    title: string,
    type: "BREAKAGE" | "STAFF" | "GIVEAWAY",
    rows: DispositionRow[],
    kg: number,
    party?: { header: string; of: (d: DispositionRow) => string | null },
  ) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        <LogDispositionDialog
          harvestId={harvest.id}
          type={type}
          produces={dispoProduces}
          staff={staffForDialog}
          customers={dispoCustomers}
        />
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nothing recorded yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Produce</TableHead>
                {party ? <TableHead>{party.header}</TableHead> : null}
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Weight (kg)</TableHead>
                <TableHead className="text-right">Value (memo)</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => {
                const memo = d.pricePerKg ? Number(d.weight) * Number(d.pricePerKg) : 0;
                return (
                  <TableRow key={d.id}>
                    <TableCell className="text-muted-foreground">{d.date.toISOString().slice(0, 10)}</TableCell>
                    <TableCell>{d.produce.name}</TableCell>
                    {party ? (
                      <TableCell>{party.of(d) ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    ) : null}
                    <TableCell className="max-w-[16rem] truncate text-muted-foreground">{d.note || "—"}</TableCell>
                    <TableCell className="text-right">{Number(d.weight)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {memo > 0 ? <Money value={memo.toFixed(4)} /> : "—"}
                    </TableCell>
                    <TableCell className="p-0">
                      <div className="flex justify-end">
                        <LogDispositionDialog
                          harvestId={harvest.id}
                          type={type}
                          produces={dispoProduces}
                          staff={staffForDialog}
                          customers={dispoCustomers}
                          existing={{
                            id: d.id,
                            produceId: d.produceId,
                            weight: Number(d.weight).toString(),
                            date: d.date.toISOString().slice(0, 10),
                            pricePerKg: d.pricePerKg ? d.pricePerKg.toFixed(4) : "",
                            staffId: d.staffId,
                            customerId: d.customerId,
                            note: d.note ?? "",
                          }}
                          trigger={<Button size="icon" variant="ghost" title="Edit entry"><Pencil className="h-4 w-4" /></Button>}
                        />
                        <DeleteDispositionButton id={d.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-t-2 bg-muted/20 font-semibold hover:bg-muted/20">
                <TableCell colSpan={party ? 4 : 3} className="text-right">Total</TableCell>
                <TableCell className="text-right">{kg} kg</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {memoSum(rows) > 0 ? <Money value={memoSum(rows).toFixed(4)} /> : "—"}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/harvest"><ArrowLeft className="h-4 w-4" /> Greenhouses</Link>
          </Button>
          <h1 className="min-w-0 break-words font-serif text-2xl sm:text-3xl">{harvest.name}</h1>
          <Badge variant={harvest.status === "LIVE" ? "accent" : "secondary"}>
            {harvest.status === "LIVE" ? "Live" : "Closed"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/print/harvest/${harvest.id}?auto=1`} target="_blank" rel="noopener noreferrer">Download PDF</a>
          </Button>
          <RecordUsageDialog
            harvestId={harvest.id}
            items={items.map((i: { id: string; name: string; unit: string }) => ({ id: i.id, name: i.name, unit: i.unit }))}
          />
          <InstallAssetDialog
            harvestId={harvest.id}
            items={installItems}
          />
          <LogLabourDialog
            harvestId={harvest.id}
            staff={staffForDialog}
            tasks={labourTasks as { id: string; name: string }[]}
          />
          <ExpenseFormDialog
            harvests={[{ id: harvest.id, name: harvest.name }]}
            defaultHarvestId={harvest.id}
            trigger={<Button variant="outline">Add expense</Button>}
          />
          <ImportExpenseSheetDialog
            harvests={[{ id: harvest.id, name: harvest.name }]}
            defaultHarvestId={harvest.id}
            trigger={<Button variant="outline">Scan sheet</Button>}
          />
          <LogSaleDialog
            harvestId={harvest.id}
            produces={produces.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))}
            customers={(customers as { id: string; name: string; type: string }[]).map((c) => ({ id: c.id, name: c.name, type: c.type }))}
            packagingItems={packagingItems}
          />
          {harvest.status === "LIVE" ? <EndHarvestButton id={harvest.id} /> : null}
          <StartHarvestDialog
            greenhouses={greenhouses.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name }))}
            produces={produces.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))}
            existing={{
              id: harvest.id,
              name: harvest.name,
              greenhouseId: harvest.greenhouseId,
              produceIds: harvestProduceList.map((p) => p.id),
              variety: harvest.variety,
              startDate: harvest.startDate.toISOString().slice(0, 10),
              endDate: harvest.endDate ? harvest.endDate.toISOString().slice(0, 10) : null,
              status: harvest.status,
            }}
            trigger={<Button variant="outline">Edit</Button>}
          />
          <DeleteHarvestButton id={harvest.id} name={harvest.name} />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{harvest.greenhouse.name}</span>
        {harvestProduceList.length > 0 ? (
          <>
            <span>·</span>
            <span className="flex flex-wrap gap-1">
              {harvestProduceList.map((p) => (
                <Badge key={p.id} variant="outline">{p.name}</Badge>
              ))}
            </span>
          </>
        ) : null}
        {harvest.variety ? <><span>·</span><span>{harvest.variety}</span></> : null}
        <span>·</span>
        <span>{harvest.startDate.toISOString().slice(0, 10)}</span>
        {harvest.endDate ? <><span>→</span><span>{harvest.endDate.toISOString().slice(0, 10)}</span></> : null}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Revenue" value={<MoneyDual value={pl.revenue} align="start" />} accent="green" />
        <StatCard label="Usage cost" value={<MoneyDual value={pl.usageCost} align="start" />} accent="red" />
        <StatCard label="Depreciation" value={<MoneyDual value={pl.depreciationCost} align="start" />} accent="red" />
        <StatCard label="Labour cost" value={<MoneyDual value={pl.labourCost} align="start" />} accent="red" />
        <StatCard label="Misc expenses" value={<MoneyDual value={pl.expenseCost} align="start" />} accent="red" />
        <StatCard label="Net profit" value={<MoneyDual value={pl.netProfit} align="start" />} accent={Number(pl.netProfit) >= 0 ? "green" : "red"} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Yield — how much this greenhouse grew</CardTitle>
          <div className="text-right">
            <div className="text-2xl font-semibold leading-none">{totalGrownKg} kg</div>
            <div className="text-xs text-muted-foreground">total grown</div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Sold", kg: salesWeightTotal, tone: "text-green-600" },
              { label: "Breakage / spillage", kg: breakageKg, tone: "text-red-600" },
              { label: "Staff consumption", kg: staffKg, tone: "text-foreground" },
              { label: "Giveaways / samples", kg: giveawayKg, tone: "text-foreground" },
            ].map((r) => (
              <div key={r.label} className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{r.label}</div>
                <div className={`text-lg font-semibold ${r.tone}`}>{r.kg} kg</div>
                <div className="text-xs text-muted-foreground">{yieldPct(r.kg)}% of yield</div>
              </div>
            ))}
          </div>
          {totalGrownKg === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Nothing recorded yet. Log sales, and use the sections below to record breakage,
              staff consumption, or giveaways — they all add up here.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sales</CardTitle></CardHeader>
        <CardContent className="p-0">
          {harvest.sales.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No sales yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Produce</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead className="text-right">Weight (kg)</TableHead>
                  <TableHead className="text-right">Price/kg</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(harvest.sales as { id: string; date: Date; produceId: string; produce: { name: string }; customerId: string | null; customer: { name: string; type: string } | null; grade: string; weight: Decimal; pricePerKg: Decimal; amount: Decimal }[]).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-muted-foreground">{s.date.toISOString().slice(0, 10)}</TableCell>
                    <TableCell>{s.produce.name}</TableCell>
                    <TableCell>
                      {s.customer ? (
                        <span className="flex flex-col">
                          <span>{s.customer.name}</span>
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.customer.type.toLowerCase()}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{s.grade}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{Number(s.weight)}</TableCell>
                    <TableCell className="text-right"><MoneyDual value={s.pricePerKg.toFixed(4)} /></TableCell>
                    <TableCell className="text-right font-medium">
                      <MoneyDual value={s.amount.toFixed(4)} />
                      {Number(s.weight) * Number(s.pricePerKg) - Number(s.amount) > 0.005 ? (
                        // Show the discount in rupiah (the unit that reconciles) so
                        // the row visibly adds up: list − off = charged. The AUD
                        // reference lives under the amount above.
                        <div className="text-[11px] font-normal text-amber-600">
                          −<Money value={(Number(s.weight) * Number(s.pricePerKg) - Number(s.amount)).toFixed(4)} /> off
                          <span className="text-muted-foreground"> (was <Money value={(Number(s.weight) * Number(s.pricePerKg)).toFixed(4)} />)</span>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="p-0">
                      <div className="flex justify-end">
                        <LogSaleDialog
                          harvestId={harvest.id}
                          produces={produces.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))}
                          customers={(customers as { id: string; name: string; type: string }[]).map((c) => ({ id: c.id, name: c.name, type: c.type }))}
                          existing={{
                            id: s.id,
                            produceId: s.produceId,
                            date: s.date.toISOString().slice(0, 10),
                            grade: s.grade as "A" | "B" | "C" | "D",
                            weight: Number(s.weight).toString(),
                            pricePerKg: s.pricePerKg.toFixed(4),
                            amount: s.amount.toFixed(4),
                            customerId: s.customerId,
                          }}
                          trigger={<Button size="icon" variant="ghost" title="Edit sale"><Pencil className="h-4 w-4" /></Button>}
                        />
                        <DeleteSaleButton id={s.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 bg-muted/20 font-semibold hover:bg-muted/20">
                  <TableCell colSpan={4}>Total</TableCell>
                  <TableCell className="text-right">{salesWeightTotal} kg</TableCell>
                  <TableCell />
                  <TableCell className="text-right text-green-600">
                    <MoneyDual value={pl.revenue} />
                    {salesDiscountTotal > 0.005 ? (
                      <div className="text-[11px] font-normal text-amber-600">
                        −<Money value={salesDiscountTotal.toFixed(4)} /> total off
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dispoCard("Breakage / spillage", "BREAKAGE", breakageRows, breakageKg)}
      {dispoCard("Staff consumption", "STAFF", staffEatRows, staffKg, {
        header: "Staff",
        of: (d) => d.staff?.name ?? null,
      })}
      {dispoCard("Giveaways / samples", "GIVEAWAY", giveawayRows, giveawayKg, {
        header: "Given to",
        of: (d) => d.customer?.name ?? null,
      })}

      <Card>
        <CardHeader><CardTitle>Usage</CardTitle></CardHeader>
        <CardContent className="p-0">
          {harvest.usages.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No usage recorded yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(harvest.usages as { id: string; date: Date; item: { name: string; unit: string }; qty: Decimal; displayQty: string | null; consumptions: { qty: Decimal; unitCost: Decimal }[] }[]).map((u) => {
                  const cost = u.consumptions.reduce((s: Decimal, c) => s.plus(new Decimal(c.qty).times(c.unitCost)), new Decimal(0));
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="text-muted-foreground">{u.date.toISOString().slice(0, 10)}</TableCell>
                      <TableCell>{u.item.name}</TableCell>
                      <TableCell className="text-right">{u.displayQty || `${Number(u.qty)} ${u.item.unit}`}</TableCell>
                      <TableCell className="text-right"><Money value={cost.toFixed(4)} /></TableCell>
                      <TableCell className="p-0"><DeleteUsageButton id={u.id} /></TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t-2 bg-muted/20 font-semibold hover:bg-muted/20">
                  <TableCell colSpan={3} className="text-right">Total</TableCell>
                  <TableCell className="text-right text-red-600"><Money value={pl.usageCost} /></TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Misc expenses</CardTitle></CardHeader>
        <CardContent className="p-0">
          {expenseRows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              No misc expenses on this harvest. Use <strong>Add expense</strong> in the header
              to charge a contractor, cash payment, or utility.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Paid to</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseRows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground">{e.date.toISOString().slice(0, 10)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{e.payee}</div>
                      {e.description ? (
                        <div className="line-clamp-1 text-xs text-muted-foreground">{e.description}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>{e.category ? <Badge variant="outline">{e.category}</Badge> : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{e.paymentMethod ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium"><Money value={e.amount.toFixed(4)} /></TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 bg-muted/20 font-semibold hover:bg-muted/20">
                  <TableCell colSpan={4} className="text-right">Total</TableCell>
                  <TableCell className="text-right text-red-600"><Money value={pl.expenseCost} /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Labour expenses</CardTitle></CardHeader>
        <CardContent className="p-0">
          {labourRows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No labour logged against this harvest.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead className="text-right">Hourly rate</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {labourRows.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-muted-foreground">{l.date.toISOString().slice(0, 10)}</TableCell>
                    <TableCell>{l.name}</TableCell>
                    <TableCell className="text-right">{l.hours.toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">{l.task ?? "—"}</TableCell>
                    <TableCell className="text-right"><Money value={l.rate.toFixed(4)} /></TableCell>
                    <TableCell className="text-right font-medium"><Money value={l.cost.toFixed(4)} /></TableCell>
                    <TableCell className="p-0">
                      <DeleteLabourButton
                        id={l.id}
                        summary={`${l.name} — ${l.hours.toFixed(2)}h on ${l.date.toISOString().slice(0, 10)}${l.task ? ` (${l.task})` : ""}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 bg-muted/20 font-semibold hover:bg-muted/20">
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right">{labourHoursTotal.toFixed(2)}h</TableCell>
                  <TableCell colSpan={2} />
                  <TableCell className="text-right text-red-600"><Money value={pl.labourCost} /></TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Depreciable assets (cocopeat, rockwool, grow bags…)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {depreciableAssets.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No depreciable assets on this harvest.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Uses remaining</TableHead>
                  <TableHead className="text-right">Charge this harvest</TableHead>
                  <TableHead className="text-right">Full cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {depreciableAssets.map((a) => {
                  const usesRemaining = Math.max(0, a.maxUses - a.useCount);
                  const inUse = !a.returnCondition && !a.discarded;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="text-muted-foreground">{a.date.toISOString().slice(0, 10)}</TableCell>
                      <TableCell>{a.item.name}</TableCell>
                      <TableCell className="text-right">
                        {fmtAssetQty(a)}
                        {(() => {
                          const pu = assetPerUnit(a);
                          return pu ? (
                            <div className="text-[10px] text-muted-foreground">
                              <Money value={pu.value} /> / {pu.label}
                            </div>
                          ) : null;
                        })()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <strong className="text-foreground">{usesRemaining}</strong> of {a.maxUses}
                      </TableCell>
                      <TableCell className="text-right"><Money value={(a.amortisedCharge ?? new Decimal(0)).toFixed(4)} /></TableCell>
                      <TableCell className="text-right text-muted-foreground"><Money value={a.fifoCost.toFixed(4)} /></TableCell>
                      <TableCell>
                        {a.returnCondition === "good" ? (
                          <Badge variant="outline">Checked in</Badge>
                        ) : a.returnCondition === "damaged" ? (
                          <Badge variant="destructive">Damaged</Badge>
                        ) : a.returnCondition === "lost" ? (
                          <Badge variant="destructive">Lost</Badge>
                        ) : a.discarded ? (
                          <Badge variant="destructive">Fully depreciated</Badge>
                        ) : (
                          <Badge variant="outline">In use</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {inUse && harvest.status === "LIVE" ? (
                          <CheckInAssetDialog
                            harvestAssetId={a.id}
                            itemName={a.item.name}
                            qty={Number(a.qty)}
                            unit={a.item.unit}
                            subUnit={a.item.subUnit}
                            subFactor={a.item.subFactor ? Number(a.item.subFactor) : null}
                            usesRemaining={usesRemaining}
                            trigger={
                              <Button size="sm" variant="outline">Check in</Button>
                            }
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t-2 bg-muted/20 font-semibold hover:bg-muted/20">
                  <TableCell colSpan={4}>Total</TableCell>
                  <TableCell className="text-right text-red-600"><Money value={pl.depreciationCost} /></TableCell>
                  <TableCell className="text-right text-muted-foreground"><Money value={deprFullTotal.toFixed(4)} /></TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          )}
          <p className="border-t bg-muted/30 p-3 text-xs text-muted-foreground">
            Each harvest is charged its share (<em>amortised charge</em>), not the full purchase cost. The full price already hit Business P&amp;L on purchase day.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fixed assets (ledger only — not in P&amp;L)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {fixedAssets.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No fixed assets installed for this harvest.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Reusable</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead className="text-right">FIFO cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fixedAssets.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-muted-foreground">{a.date.toISOString().slice(0, 10)}</TableCell>
                    <TableCell>{a.item.name}</TableCell>
                    <TableCell className="text-right">{fmtAssetQty(a)}</TableCell>
                    <TableCell>{a.reusable ? <Badge variant="outline">Reusable</Badge> : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{a.condition ?? "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground"><Money value={a.fifoCost.toFixed(4)} /></TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 bg-muted/20 font-semibold hover:bg-muted/20">
                  <TableCell colSpan={5}>Total</TableCell>
                  <TableCell className="text-right text-muted-foreground"><Money value={fixedFifoTotal.toFixed(4)} /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
          <p className="border-t bg-muted/30 p-3 text-xs text-muted-foreground">
            Fixed-asset installs (drippers, frames) are tracked here but excluded from the P&amp;L.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Profit &amp; Loss statement</CardTitle></CardHeader>
        <CardContent className="space-y-4 p-6 text-sm">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Income</h3>
            <ul className="space-y-1">
              {(harvest.sales as { id: string; date: Date; produce: { name: string }; grade: string; weight: Decimal; amount: Decimal }[]).map((s) => (
                <li key={s.id} className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {s.date.toISOString().slice(0, 10)} — {s.produce.name} (Grade {s.grade}, {Number(s.weight)}kg)
                  </span>
                  <span className="text-green-600"><Money value={s.amount.toFixed(4)} /></span>
                </li>
              ))}
              <li className="mt-2 flex items-center justify-between border-t pt-2 font-semibold">
                <span>Total income</span>
                <span className="text-green-600"><Money value={pl.revenue} /></span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expenses — Usage</h3>
            <ul className="space-y-1">
              {(harvest.usages as { id: string; date: Date; item: { name: string }; displayQty: string | null; consumptions: { qty: Decimal; unitCost: Decimal }[] }[]).map((u) => {
                const cost = u.consumptions.reduce((s: Decimal, c) => s.plus(new Decimal(c.qty).times(c.unitCost)), new Decimal(0));
                return (
                  <li key={u.id} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{u.date.toISOString().slice(0, 10)} — {u.item.name} ({u.displayQty ?? ""})</span>
                    <span className="text-red-600"><Money value={cost.toFixed(4)} /></span>
                  </li>
                );
              })}
            </ul>
          </section>

          {depreciableAssets.length > 0 ? (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expenses — Depreciation (amortised assets)</h3>
              <ul className="space-y-1">
                {depreciableAssets.map((a) => (
                  <li key={a.id} className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {a.date.toISOString().slice(0, 10)} — {a.item.name} × {fmtAssetQty(a)} (use {a.useCount} of {a.maxUses})
                    </span>
                    <span className="text-red-600"><Money value={(a.amortisedCharge ?? new Decimal(0)).toFixed(4)} /></span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {expenseRows.length > 0 ? (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expenses — Misc</h3>
              <ul className="space-y-1">
                {expenseRows.map((e) => (
                  <li key={e.id} className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {e.date.toISOString().slice(0, 10)} — {e.payee}{e.category ? ` (${e.category})` : ""}
                    </span>
                    <span className="text-red-600"><Money value={e.amount.toFixed(4)} /></span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expenses — Labour</h3>
            <ul className="space-y-1">
              {labourRows.map((l) => (
                <li key={l.id} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{l.date.toISOString().slice(0, 10)} — {l.name} ({l.hours.toFixed(2)}h @ <Money value={l.rate.toFixed(4)} precise />){l.task ? ` — ${l.task}` : ""}</span>
                  <span className="text-red-600"><Money value={l.cost.toFixed(4)} /></span>
                </li>
              ))}
              <li className="mt-2 flex items-center justify-between border-t pt-2 font-semibold">
                <span>Total expenses</span>
                <span className="text-red-600"><Money value={totalExpenses} /></span>
              </li>
            </ul>
          </section>

          <section className={`flex items-center justify-between rounded-md border p-3 font-semibold ${Number(pl.netProfit) >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
            <span>Net profit</span>
            <span className={Number(pl.netProfit) >= 0 ? "text-green-600" : "text-red-600"}><Money value={pl.netProfit} /></span>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: React.ReactNode; accent: "green" | "red" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold ${accent === "green" ? "text-green-600" : "text-red-600"}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
