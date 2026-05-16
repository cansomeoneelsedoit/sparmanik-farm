import { prisma } from "@/server/prisma";
import { getHarvestPL } from "@/server/pl";
import { Card, CardContent } from "@/components/ui/card";
import { Money } from "@/components/shared/money";

export const dynamic = "force-dynamic";

export default async function FinancialsPage() {
  const harvests = await prisma.harvest.findMany({ select: { id: true, name: true, status: true } });
  const pls = await Promise.all(harvests.map(async (h: { id: string }) => ({ id: h.id, pl: await getHarvestPL(h.id) })));

  let revenue = 0;
  let usageCost = 0;
  let labourCost = 0;
  let depreciationCost = 0;
  for (const p of pls) {
    revenue += Number(p.pl.revenue);
    usageCost += Number(p.pl.usageCost);
    labourCost += Number(p.pl.labourCost);
    depreciationCost += Number(p.pl.depreciationCost);
  }
  const net = revenue - usageCost - labourCost - depreciationCost;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">Financials</h1>
      <div className="grid gap-4 md:grid-cols-5">
        <Stat label="Revenue" value={revenue.toFixed(4)} colour="green" />
        <Stat label="Usage expense" value={usageCost.toFixed(4)} colour="red" />
        <Stat label="Depreciation" value={depreciationCost.toFixed(4)} colour="red" />
        <Stat label="Labour expense" value={labourCost.toFixed(4)} colour="red" />
        <Stat label="Net P&L" value={net.toFixed(4)} colour={net >= 0 ? "green" : "red"} />
      </div>
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Per-harvest breakdown is available on the Harvest detail pages. P&amp;L forecast view coming in a later phase.
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
