import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { SimulatorClient } from "@/app/(app)/simulator/simulator-client";

export const dynamic = "force-dynamic";

/**
 * Farm simulator — sandbox P&L calculator.
 *
 * Use case: the user wants to test "would this greenhouse cycle be
 * profitable?" without touching real stock or sales. They mock up costs
 * (items, labour, depreciable assets, other), expected yield + price/kg,
 * and the page shows live P&L.
 *
 * Implementation strategy:
 *   - No DB schema additions. Scenarios live in the browser's
 *     localStorage, scoped per-user implicitly (whoever's logged in on the
 *     browser).
 *   - We hand the client component the org's real Item / Produce / Staff
 *     lists as autocomplete options so the simulation feels realistic,
 *     but selecting one does NOT consume stock — the simulator is purely
 *     calculator-style.
 *   - Last batch's unit price for any picked item flows through so the
 *     user doesn't have to retype prices they've already paid recently.
 */
export default async function SimulatorPage() {
  // Build a lightweight option list for the autocomplete. Selecting an
  // item here will NOT consume stock — see SimulatorClient for why.
  const [items, produces, staff, setting] = await Promise.all([
    prisma.item.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        subUnit: true,
        subFactor: true,
        // Most recent batch lets us pre-fill the user's typical unit
        // price for the row — avoids the "what did I pay last time?"
        // lookup.
        batches: {
          orderBy: { date: "desc" },
          take: 1,
          select: { price: true },
        },
      },
    }),
    prisma.produce.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.staff.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        // Take the most-recent staff rate for a sensible default hourly
        // labour cost when the user picks that staff member.
        rates: {
          orderBy: { effectiveFrom: "desc" },
          take: 1,
          select: { rate: true },
        },
      },
    }),
    prisma.setting.findFirst({ select: { exchangeRate: true } }),
  ]);

  type ItemRow = {
    id: string;
    code: string;
    name: string;
    unit: string;
    subUnit: string | null;
    subFactor: Decimal | null;
    batches: { price: Decimal }[];
  };
  type StaffRow = { id: string; name: string; rates: { rate: Decimal }[] };

  return (
    <SimulatorClient
      itemOptions={(items as ItemRow[]).map((i) => ({
        id: i.id,
        code: i.code,
        name: i.name?.trim() || `Untitled (${i.code})`,
        unit: i.unit,
        subUnit: i.subUnit,
        subFactor: i.subFactor ? Number(i.subFactor) : null,
        lastUnitPrice: i.batches[0]
          ? Number(new Decimal(i.batches[0].price).toFixed(2))
          : 0,
      }))}
      produceOptions={produces.map((p: { id: string; name: string }) => ({
        id: p.id,
        name: p.name,
      }))}
      staffOptions={(staff as StaffRow[]).map((s) => ({
        id: s.id,
        name: s.name,
        defaultHourlyRate: s.rates[0]
          ? Number(new Decimal(s.rates[0].rate).toFixed(2))
          : 0,
      }))}
      exchangeRate={
        setting?.exchangeRate ? Number(setting.exchangeRate.toFixed(2)) : 1
      }
    />
  );
}
