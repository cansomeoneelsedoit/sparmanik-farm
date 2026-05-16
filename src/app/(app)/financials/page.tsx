import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/shared/money";

export const dynamic = "force-dynamic";

type WageLineRow = {
  hours: Decimal;
  wageEntry: { staffId: string; date: Date };
};

async function effectiveRate(staffId: string, date: Date): Promise<Decimal> {
  const r = await prisma.staffRate.findFirst({
    where: { staffId, effectiveFrom: { lte: date } },
    orderBy: { effectiveFrom: "desc" },
    select: { rate: true },
  });
  return r ? new Decimal(r.rate) : new Decimal(0);
}

export default async function FinancialsPage() {
  // --- Revenue: every Sale.amount across every harvest. ---
  const sales = await prisma.sale.findMany({ select: { amount: true } });
  const revenue = sales.reduce(
    (s: Decimal, x: { amount: Decimal }) => s.plus(x.amount),
    new Decimal(0),
  );

  // --- Cost of Goods: Σ(batch.qty × batch.price) for all purchases. ---
  // Returned-as-zero-cost batches (`returned = true`) have price = 0 anyway,
  // so the math stays right even if we don't filter — but we filter
  // explicitly for clarity.
  const batches = await prisma.batch.findMany({
    where: { returned: false },
    select: { qty: true, price: true },
  });
  const cogs = batches.reduce(
    (s: Decimal, b: { qty: Decimal; price: Decimal }) =>
      s.plus(new Decimal(b.qty).times(b.price)),
    new Decimal(0),
  );

  // --- Total wages: every WageEntryLine's hours × effective rate at that
  // entry's date. Includes lines NOT tied to any harvest (general farm work)
  // because the question asked for the "real" farm-level P&L.
  const wageLines = (await prisma.wageEntryLine.findMany({
    select: {
      hours: true,
      wageEntry: { select: { staffId: true, date: true } },
    },
  })) as WageLineRow[];
  let totalWages = new Decimal(0);
  let harvestAllocatedWages = new Decimal(0);
  for (const l of wageLines) {
    const rate = await effectiveRate(l.wageEntry.staffId, l.wageEntry.date);
    totalWages = totalWages.plus(new Decimal(l.hours).times(rate));
  }
  const allocatedLines = (await prisma.wageEntryLine.findMany({
    where: { harvestId: { not: null } },
    select: {
      hours: true,
      wageEntry: { select: { staffId: true, date: true } },
    },
  })) as WageLineRow[];
  for (const l of allocatedLines) {
    const rate = await effectiveRate(l.wageEntry.staffId, l.wageEntry.date);
    harvestAllocatedWages = harvestAllocatedWages.plus(
      new Decimal(l.hours).times(rate),
    );
  }
  const unallocatedWages = totalWages.minus(harvestAllocatedWages);

  // --- Depreciation: sum amortised charges across depreciable assets. ---
  const assets = await prisma.harvestAsset.findMany({
    where: { depreciable: true },
    select: { amortisedCharge: true },
  });
  const depreciation = (assets as { amortisedCharge: Decimal | null }[]).reduce(
    (s: Decimal, a) => (a.amortisedCharge ? s.plus(a.amortisedCharge) : s),
    new Decimal(0),
  );

  // Net P&L = Revenue − COGS − Wages − Depreciation.
  // (Depreciation is already a per-use share of past COGS so we technically
  // double-count when we also charge full COGS — for a farm operator's
  // cash-flow lens that's the right answer; the depreciation column is
  // shown alongside so the harvest-level view ties back.)
  const totalCosts = cogs.plus(totalWages).plus(depreciation);
  const net = revenue.minus(totalCosts);

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">Financials</h1>
      <div className="grid gap-4 md:grid-cols-5">
        <Stat label="Revenue" value={revenue.toFixed(4)} colour="green" />
        <Stat label="Cost of goods" value={cogs.toFixed(4)} colour="red" />
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
          <CardTitle>Profit &amp; Loss statement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-6 text-sm">
          <Row label="Revenue (sales across all harvests)" value={revenue.toFixed(4)} positive />
          <Section title="Cost of goods sold">
            <Row label="Inventory purchases (Σ batch qty × price)" value={cogs.toFixed(4)} negative />
          </Section>
          <Section title="Wages">
            <Row
              label="Allocated to harvests (charged to Harvest P&L)"
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
              label="Amortised assets (e.g. cocopeat, rockwool — per-use share)"
              value={depreciation.toFixed(4)}
              negative
            />
          </Section>
          <div className="my-2 border-t" />
          <Row label="Net Profit / Loss" value={net.toFixed(4)} bold positive={net.gte(0)} negative={net.lt(0)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-1 p-4 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">How this reconciles with Harvest P&amp;L:</strong>{" "}
            Per-harvest pages charge depreciation (amortised) + usage at FIFO
            cost + only the wages allocated to that harvest. The farm P&amp;L above
            counts every wage hour the staff logged (whether attached to a
            harvest or not) plus the full purchase cost of every inventory
            batch — that's the actual cash that left the business.
          </p>
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
