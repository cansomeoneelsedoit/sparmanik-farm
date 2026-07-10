import { notFound, redirect } from "next/navigation";
import { todayWIB } from "@/lib/date";

import { auth } from "@/auth";
import { getActiveOrgId } from "@/server/org";
import { prisma } from "@/server/prisma";
import { getHarvestPL } from "@/server/pl";
import { Decimal } from "@/server/decimal";
import { Money } from "@/components/shared/money";
import { ReportToolbar } from "@/app/print/harvest/[harvestId]/report-toolbar";

export const dynamic = "force-dynamic";

/**
 * Printable, self-contained financial report for a single greenhouse/harvest.
 * Lives OUTSIDE the (app) layout so there's no sidebar/topbar — the page is its
 * own clean A4 sheet. Reached from the harvest page's "Download PDF" button; a
 * toolbar auto-opens the browser print dialog (Save as PDF). No PDF library or
 * headless browser needed — the browser's own print engine renders it, so it
 * works identically on localhost and Railway.
 *
 * All money goes through <Money> so it honours the active locale (Rp / A$).
 */
export default async function HarvestReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ harvestId: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  // Education-portal logins never see farm financials (belt-and-braces with
  // the proxy fence — this route lives outside the (app) layout).
  if (session.user.role === "PORTAL") redirect("/training");
  // Explicit org guard: this route lives outside the (app) layout, so don't
  // lean only on the Prisma org-scoping extension. Resolve the active org and
  // verify the harvest belongs to it before rendering (or querying its labour
  // lines, which aren't org-scoped at the model level).
  const activeOrgId = await getActiveOrgId();
  if (!activeOrgId) notFound();
  const { harvestId } = await params;
  const { auto } = await searchParams;

  const harvest = await prisma.harvest.findFirst({
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
  });
  if (!harvest || harvest.organizationId !== activeOrgId) notFound();

  const [org, pl, expenseRows, labourLines] = await Promise.all([
    harvest.organizationId
      ? prisma.organization.findUnique({ where: { id: harvest.organizationId }, select: { name: true } })
      : Promise.resolve(null),
    getHarvestPL(harvest.id),
    prisma.expense.findMany({ where: { harvestId }, orderBy: { date: "desc" } }),
    prisma.wageEntryLine.findMany({
      where: { harvestId: harvest.id },
      include: {
        wageEntry: {
          select: {
            date: true,
            staff: {
              select: { name: true, rates: { orderBy: { effectiveFrom: "desc" }, select: { rate: true, effectiveFrom: true } } },
            },
          },
        },
      },
    }),
  ]);

  // ---- Labour rows (resolve rate via effective-from history) ----
  type LabourLine = {
    id: string;
    hours: Decimal;
    task: string | null;
    wageEntry: { date: Date; staff: { name: string; rates: { rate: Decimal; effectiveFrom: Date }[] } };
  };
  const labourRows = (labourLines as LabourLine[]).map((l) => {
    const wageDate = l.wageEntry.date;
    const r = l.wageEntry.staff.rates.find((x) => x.effectiveFrom <= wageDate);
    const rate = r ? new Decimal(r.rate) : new Decimal(0);
    return { id: l.id, date: l.wageEntry.date, name: l.wageEntry.staff.name, hours: new Decimal(l.hours), rate, cost: new Decimal(l.hours).times(rate), task: l.task };
  });

  // ---- Asset rows ----
  type AssetRow = {
    id: string;
    date: Date;
    item: { name: string; unit: string; subUnit: string | null; subFactor: Decimal | null };
    qty: Decimal;
    depreciable: boolean;
    amortisedCharge: Decimal | null;
    consumptions: { qty: Decimal; unitCost: Decimal }[];
  };
  const assetRows = (harvest.assets as AssetRow[]).map((a) => ({
    ...a,
    fifoCost: a.consumptions.reduce((s: Decimal, c) => s.plus(new Decimal(c.qty).times(c.unitCost)), new Decimal(0)),
  }));
  const depreciable = assetRows.filter((a) => a.depreciable);
  const fixed = assetRows.filter((a) => !a.depreciable);
  const fmtAssetQty = (a: AssetRow) =>
    a.item.subFactor && a.item.subUnit
      ? `${Number(new Decimal(a.qty).times(a.item.subFactor))} ${a.item.subUnit}`
      : `${Number(a.qty)} ${a.item.unit}`;

  // ---- Typed views of the harvest collections ----
  type SaleRow = { id: string; date: Date; produce: { name: string }; customer: { name: string; type: string } | null; grade: string; weight: Decimal; pricePerKg: Decimal; amount: Decimal };
  type UsageRow = { id: string; date: Date; item: { name: string; unit: string }; qty: Decimal; displayQty: string | null; consumptions: { qty: Decimal; unitCost: Decimal }[] };
  type ExpenseRow = { id: string; date: Date; amount: Decimal; category: string | null; payee: string };
  const sales = harvest.sales as SaleRow[];
  const usages = harvest.usages as UsageRow[];
  const expenses = expenseRows as ExpenseRow[];

  // ---- Column totals (money totals reuse the P&L so they match the app) ----
  const salesWeight = Math.round(sales.reduce((s, x) => s + Number(x.weight), 0) * 1000) / 1000;
  const labourHours = labourRows.reduce((s, l) => s + Number(l.hours), 0);
  const deprFull = depreciable.reduce((s, a) => s.plus(a.fifoCost), new Decimal(0));
  const fixedFifo = fixed.reduce((s, a) => s.plus(a.fifoCost), new Decimal(0));

  // ---- Dispositions (non-sale fates of produce — weight-only) ----
  type DispoRow = {
    id: string;
    date: Date;
    type: "BREAKAGE" | "STAFF" | "GIVEAWAY";
    produce: { name: string };
    staff: { name: string } | null;
    customer: { name: string } | null;
    weight: Decimal;
    pricePerKg: Decimal | null;
    note: string | null;
  };
  const dispoRows = (harvest.dispositions as DispoRow[]) ?? [];
  const breakage = dispoRows.filter((x) => x.type === "BREAKAGE");
  const staffEat = dispoRows.filter((x) => x.type === "STAFF");
  const giveaway = dispoRows.filter((x) => x.type === "GIVEAWAY");
  const dKg = (rows: DispoRow[]) => Math.round(rows.reduce((s, x) => s + Number(x.weight), 0) * 1000) / 1000;
  const breakageKg = dKg(breakage);
  const staffKg = dKg(staffEat);
  const giveawayKg = dKg(giveaway);
  const totalGrownKg = Math.round((salesWeight + breakageKg + staffKg + giveawayKg) * 1000) / 1000;
  const yPct = (kg: number) => (totalGrownKg > 0 ? Math.round((kg / totalGrownKg) * 1000) / 10 : 0);
  const dMemo = (x: DispoRow) => (x.pricePerKg ? Number(x.weight) * Number(x.pricePerKg) : 0);
  const dMemoSum = (rows: DispoRow[]) => rows.reduce((s, x) => s + dMemo(x), 0);
  const memoCell = (total: number) =>
    total > 0 ? <Money value={total.toFixed(4)} /> : <>—</>;

  const produceList: string[] =
    harvest.produces && harvest.produces.length > 0
      ? (harvest.produces as { produce: { name: string } }[]).map((p) => p.produce.name)
      : harvest.produce
        ? [harvest.produce.name]
        : [];

  const usageCost = (u: UsageRow) => u.consumptions.reduce((s: Decimal, c) => s.plus(new Decimal(c.qty).times(c.unitCost)), new Decimal(0));
  const d = (date: Date) => date.toISOString().slice(0, 10);
  const today = todayWIB();

  return (
    <div className="print-report min-h-screen bg-zinc-100 py-6 text-zinc-900">
      {/* Global print rules — A4, hide the toolbar, force light colours, keep
          section backgrounds when printing. Scoped to this dedicated route. */}
      <style>{`
        @media print {
          @page { size: A4; margin: 13mm; }
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .print-report { background: #fff !important; padding: 0 !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; width: auto !important; }
          .avoid-break { break-inside: avoid; }
          /* Keep each data row whole; repeat headers across pages for long tables. */
          table tbody tr { break-inside: avoid; }
          thead { display: table-header-group; }
          /* Bump the lightest greys so empty-state text/borders stay legible on paper. */
          .print-report .text-zinc-400 { color: #6b7280 !important; }
          .print-report .border-dashed { border-color: #9ca3af !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <ReportToolbar autoPrint={auto === "1"} />

      <div className="sheet mx-auto max-w-[820px] bg-white px-10 py-8 shadow-sm">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-zinc-800 pb-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              {org?.name ?? "Farm"} · Greenhouse Report
            </div>
            <h1 className="mt-1 font-serif text-3xl leading-tight">{harvest.name}</h1>
            <div className="mt-1 text-sm text-zinc-600">
              {harvest.greenhouse.name}
              {produceList.length ? <> · {produceList.join(", ")}</> : null}
              {harvest.variety ? <> · {harvest.variety}</> : null}
            </div>
          </div>
          <div className="text-right text-xs text-zinc-600">
            <div>
              <span className="font-medium text-zinc-800">{harvest.status === "LIVE" ? "Live" : "Closed"}</span>
            </div>
            <div className="mt-1">{d(harvest.startDate)}{harvest.endDate ? ` → ${d(harvest.endDate)}` : ""}</div>
            <div className="mt-1 text-zinc-400">Generated {today}</div>
          </div>
        </div>

        {/* Summary */}
        <div className="avoid-break mt-6 grid grid-cols-3 gap-3">
          <Stat label="Revenue" value={<Money value={pl.revenue} />} tone="pos" />
          <Stat label="Usage cost" value={<Money value={pl.usageCost} />} tone="neg" />
          <Stat label="Depreciation" value={<Money value={pl.depreciationCost} />} tone="neg" />
          <Stat label="Labour cost" value={<Money value={pl.labourCost} />} tone="neg" />
          <Stat label="Misc expenses" value={<Money value={pl.expenseCost} />} tone="neg" />
          <Stat label="Net profit" value={<Money value={pl.netProfit} />} tone={Number(pl.netProfit) >= 0 ? "pos" : "neg"} strong />
        </div>

        {/* Yield reconciliation — how much the greenhouse grew */}
        <Section title="Yield — how much this greenhouse grew">
          <div className="grid grid-cols-5 gap-2">
            {[
              { label: "Sold", kg: salesWeight, pct: yPct(salesWeight) },
              { label: "Breakage", kg: breakageKg, pct: yPct(breakageKg) },
              { label: "Staff", kg: staffKg, pct: yPct(staffKg) },
              { label: "Giveaways", kg: giveawayKg, pct: yPct(giveawayKg) },
              { label: "Total grown", kg: totalGrownKg, pct: 100, strong: true },
            ].map((r) => (
              <div
                key={r.label}
                className={`rounded-md border px-2 py-1.5 ${r.strong ? "border-zinc-400 bg-zinc-50" : "border-zinc-200"}`}
              >
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">{r.label}</div>
                <div className="text-sm font-semibold">{r.kg} kg</div>
                <div className="text-[10px] text-zinc-500">{r.pct}%</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Sales */}
        <Section title="Sales">
          {sales.length === 0 ? <Empty>No sales recorded.</Empty> : (
            <Tbl head={["Date", "Produce", "Customer", "Grade", "Weight (kg)", "Price/kg", "Amount"]} align={[0, 0, 0, 0, 1, 1, 1]}>
              {sales.map((s) => (
                <tr key={s.id} className="border-t border-zinc-200">
                  <Td>{d(s.date)}</Td>
                  <Td>{s.produce.name}</Td>
                  <Td>{s.customer ? s.customer.name : "—"}</Td>
                  <Td>{s.grade}</Td>
                  <Td r>{Number(s.weight)}</Td>
                  <Td r><Money value={s.pricePerKg.toFixed(4)} /></Td>
                  <Td r><Money value={s.amount.toFixed(4)} /></Td>
                </tr>
              ))}
              <Total cols={[{ span: 4, text: "Total" }, { text: `${salesWeight} kg`, r: true }, { text: "" }, { node: <Money value={pl.revenue} />, r: true }]} />
            </Tbl>
          )}
        </Section>

        {/* Breakage / spillage */}
        {breakage.length > 0 ? (
          <Section title="Breakage / spillage">
            <Tbl head={["Date", "Produce", "Note", "Weight (kg)", "Value (memo)"]} align={[0, 0, 0, 1, 1]}>
              {breakage.map((x) => (
                <tr key={x.id} className="border-t border-zinc-200">
                  <Td>{d(x.date)}</Td>
                  <Td>{x.produce.name}</Td>
                  <Td>{x.note ?? "—"}</Td>
                  <Td r>{Number(x.weight)}</Td>
                  <Td r>{dMemo(x) > 0 ? <Money value={dMemo(x).toFixed(4)} /> : "—"}</Td>
                </tr>
              ))}
              <Total cols={[{ span: 3, text: "Total", r: true }, { text: `${breakageKg} kg`, r: true }, { node: memoCell(dMemoSum(breakage)), r: true }]} />
            </Tbl>
          </Section>
        ) : null}

        {/* Staff consumption */}
        {staffEat.length > 0 ? (
          <Section title="Staff consumption">
            <Tbl head={["Date", "Produce", "Staff", "Note", "Weight (kg)", "Value (memo)"]} align={[0, 0, 0, 0, 1, 1]}>
              {staffEat.map((x) => (
                <tr key={x.id} className="border-t border-zinc-200">
                  <Td>{d(x.date)}</Td>
                  <Td>{x.produce.name}</Td>
                  <Td>{x.staff?.name ?? "—"}</Td>
                  <Td>{x.note ?? "—"}</Td>
                  <Td r>{Number(x.weight)}</Td>
                  <Td r>{dMemo(x) > 0 ? <Money value={dMemo(x).toFixed(4)} /> : "—"}</Td>
                </tr>
              ))}
              <Total cols={[{ span: 4, text: "Total", r: true }, { text: `${staffKg} kg`, r: true }, { node: memoCell(dMemoSum(staffEat)), r: true }]} />
            </Tbl>
          </Section>
        ) : null}

        {/* Giveaways / samples */}
        {giveaway.length > 0 ? (
          <Section title="Giveaways / samples">
            <Tbl head={["Date", "Produce", "Given to", "Note", "Weight (kg)", "Value (memo)"]} align={[0, 0, 0, 0, 1, 1]}>
              {giveaway.map((x) => (
                <tr key={x.id} className="border-t border-zinc-200">
                  <Td>{d(x.date)}</Td>
                  <Td>{x.produce.name}</Td>
                  <Td>{x.customer?.name ?? "—"}</Td>
                  <Td>{x.note ?? "—"}</Td>
                  <Td r>{Number(x.weight)}</Td>
                  <Td r>{dMemo(x) > 0 ? <Money value={dMemo(x).toFixed(4)} /> : "—"}</Td>
                </tr>
              ))}
              <Total cols={[{ span: 4, text: "Total", r: true }, { text: `${giveawayKg} kg`, r: true }, { node: memoCell(dMemoSum(giveaway)), r: true }]} />
            </Tbl>
          </Section>
        ) : null}

        {/* Usage */}
        <Section title="Usage (consumables)">
          {usages.length === 0 ? <Empty>No usage recorded.</Empty> : (
            <Tbl head={["Date", "Item", "Qty", "Cost"]} align={[0, 0, 1, 1]}>
              {usages.map((u) => (
                <tr key={u.id} className="border-t border-zinc-200">
                  <Td>{d(u.date)}</Td>
                  <Td>{u.item.name}</Td>
                  <Td r>{u.displayQty || `${Number(u.qty)} ${u.item.unit}`}</Td>
                  <Td r><Money value={usageCost(u).toFixed(4)} /></Td>
                </tr>
              ))}
              <Total cols={[{ span: 3, text: "Total", r: true }, { node: <Money value={pl.usageCost} />, r: true }]} />
            </Tbl>
          )}
        </Section>

        {/* Labour */}
        <Section title="Labour">
          {labourRows.length === 0 ? <Empty>No labour logged.</Empty> : (
            <Tbl head={["Date", "Name", "Hours", "Task", "Rate", "Cost"]} align={[0, 0, 1, 0, 1, 1]}>
              {labourRows.map((l) => (
                <tr key={l.id} className="border-t border-zinc-200">
                  <Td>{d(l.date)}</Td>
                  <Td>{l.name}</Td>
                  <Td r>{l.hours.toFixed(2)}</Td>
                  <Td>{l.task ?? "—"}</Td>
                  <Td r><Money value={l.rate.toFixed(4)} /></Td>
                  <Td r><Money value={l.cost.toFixed(4)} /></Td>
                </tr>
              ))}
              <Total cols={[{ span: 2, text: "Total" }, { text: `${labourHours.toFixed(2)}h`, r: true }, { span: 2, text: "" }, { node: <Money value={pl.labourCost} />, r: true }]} />
            </Tbl>
          )}
        </Section>

        {/* Misc expenses */}
        <Section title="Misc expenses">
          {expenses.length === 0 ? <Empty>No misc expenses.</Empty> : (
            <Tbl head={["Date", "Paid to", "Category", "Amount"]} align={[0, 0, 0, 1]}>
              {expenses.map((e) => (
                <tr key={e.id} className="border-t border-zinc-200">
                  <Td>{d(e.date)}</Td>
                  <Td>{e.payee}</Td>
                  <Td>{e.category ?? "—"}</Td>
                  <Td r><Money value={e.amount.toFixed(4)} /></Td>
                </tr>
              ))}
              <Total cols={[{ span: 3, text: "Total", r: true }, { node: <Money value={pl.expenseCost} />, r: true }]} />
            </Tbl>
          )}
        </Section>

        {/* Depreciable assets */}
        {depreciable.length > 0 ? (
          <Section title="Depreciable assets">
            <Tbl head={["Date", "Item", "Qty", "Charge this harvest", "Full cost"]} align={[0, 0, 1, 1, 1]}>
              {depreciable.map((a) => (
                <tr key={a.id} className="border-t border-zinc-200">
                  <Td>{d(a.date)}</Td>
                  <Td>{a.item.name}</Td>
                  <Td r>{fmtAssetQty(a)}</Td>
                  <Td r><Money value={(a.amortisedCharge ?? new Decimal(0)).toFixed(4)} /></Td>
                  <Td r><Money value={a.fifoCost.toFixed(4)} /></Td>
                </tr>
              ))}
              <Total cols={[{ span: 3, text: "Total" }, { node: <Money value={pl.depreciationCost} />, r: true }, { node: <Money value={deprFull.toFixed(4)} />, r: true }]} />
            </Tbl>
          </Section>
        ) : null}

        {/* Fixed assets */}
        {fixed.length > 0 ? (
          <Section title="Fixed assets (ledger only — not in P&L)">
            <Tbl head={["Date", "Item", "Qty", "Cost"]} align={[0, 0, 1, 1]}>
              {fixed.map((a) => (
                <tr key={a.id} className="border-t border-zinc-200">
                  <Td>{d(a.date)}</Td>
                  <Td>{a.item.name}</Td>
                  <Td r>{fmtAssetQty(a)}</Td>
                  <Td r><Money value={a.fifoCost.toFixed(4)} /></Td>
                </tr>
              ))}
              <Total cols={[{ span: 3, text: "Total" }, { node: <Money value={fixedFifo.toFixed(4)} />, r: true }]} />
            </Tbl>
          </Section>
        ) : null}

        {/* Net result band */}
        <div className={`avoid-break mt-7 flex items-center justify-between rounded-md border px-4 py-3 text-lg font-semibold ${Number(pl.netProfit) >= 0 ? "border-green-300 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-700"}`}>
          <span>Net {Number(pl.netProfit) >= 0 ? "profit" : "loss"}</span>
          <span><Money value={pl.netProfit} /></span>
        </div>

        <div className="mt-8 border-t border-zinc-200 pt-3 text-center text-[10px] text-zinc-400">
          {org?.name ?? "Farm"} · {harvest.name} · generated {today}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, strong }: { label: string; value: React.ReactNode; tone: "pos" | "neg"; strong?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${strong ? "border-zinc-400 bg-zinc-50" : "border-zinc-200"}`}>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-lg font-semibold ${tone === "pos" ? "text-green-700" : "text-red-700"}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="avoid-break mt-6">
      <h2 className="mb-1.5 text-sm font-semibold text-zinc-800">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-400">{children}</div>;
}

function Tbl({ head, align, children }: { head: string[]; align: (0 | 1)[]; children: React.ReactNode }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="text-[10px] uppercase tracking-wide text-zinc-500">
          {head.map((h, i) => (
            <th key={h} className={`pb-1 font-medium ${align[i] === 1 ? "text-right" : "text-left"}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Td({ children, r }: { children: React.ReactNode; r?: boolean }) {
  return <td className={`py-1 align-top break-words ${r ? "text-right tabular-nums" : "text-left"}`}>{children}</td>;
}

type TotalCol = { span?: number; text?: string; node?: React.ReactNode; r?: boolean };
function Total({ cols }: { cols: TotalCol[] }) {
  return (
    <tr className="border-t-2 border-zinc-300 font-semibold">
      {cols.map((c, i) => (
        <td key={i} colSpan={c.span ?? 1} className={`py-1.5 ${c.r ? "text-right tabular-nums" : "text-left"}`}>
          {c.node ?? c.text ?? ""}
        </td>
      ))}
    </tr>
  );
}
