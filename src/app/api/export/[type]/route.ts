import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { getActiveOrgId } from "@/server/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CSV export for the accountant / tax / "get my data out" (app review #41).
 * /api/export/sales | expenses | wages | inventory — auth-gated and scoped to
 * the caller's active org. Figures are in IDR (the source currency).
 */

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(headers: string[], rows: (unknown[])[]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  // BOM so Excel opens UTF-8 (Indonesian names) correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: { toString(): string } | null | undefined) => (v == null ? "" : v.toString());

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const orgId = await getActiveOrgId();
  if (!orgId) return new Response("No active organisation", { status: 400 });

  const { type } = await params;
  let filename: string;
  let csv: string;

  if (type === "sales") {
    const rows = await prisma.sale.findMany({
      orderBy: { date: "desc" },
      include: {
        produce: { select: { name: true } },
        customer: { select: { name: true, type: true } },
        harvest: { select: { name: true, greenhouse: { select: { name: true } } } },
      },
    });
    csv = toCsv(
      ["Date", "Greenhouse", "Cycle", "Produce", "Grade", "Customer", "Customer type", "Weight (kg)", "Price/kg (Rp)", "Packaging (Rp)", "Amount (Rp)"],
      (rows as Array<Record<string, unknown> & { date: Date; produce: { name: string }; customer: { name: string; type: string } | null; harvest: { name: string; greenhouse: { name: string } | null } }>).map((s) => [
        ymd(s.date), s.harvest.greenhouse?.name ?? "", s.harvest.name, s.produce.name, s.grade,
        s.customer?.name ?? "", s.customer?.type ?? "", num(s.weight as never), num(s.pricePerKg as never),
        num(s.packagingCharge as never), num(s.amount as never),
      ]),
    );
    filename = "sales";
  } else if (type === "expenses") {
    const rows = await prisma.expense.findMany({
      orderBy: { date: "desc" },
      include: { harvest: { select: { name: true } } },
    });
    csv = toCsv(
      ["Date", "Payee", "Category", "Description", "Payment method", "Cycle", "Amount (Rp)"],
      (rows as Array<Record<string, unknown> & { date: Date; harvest: { name: string } | null }>).map((e) => [
        ymd(e.date), e.payee, e.category ?? "", e.description ?? "", e.paymentMethod ?? "",
        e.harvest?.name ?? "(overhead)", num(e.amount as never),
      ]),
    );
    filename = "expenses";
  } else if (type === "wages") {
    // WageEntryLine has no org column — scope via the Staff parent. Resolve each
    // line's effective rate from StaffRate history (effectiveFrom <= date).
    const [lines, rates] = await Promise.all([
      prisma.wageEntryLine.findMany({
        where: { wageEntry: { staff: { organizationId: orgId } } },
        include: {
          wageEntry: { select: { date: true, staff: { select: { name: true } }, staffId: true } },
          harvest: { select: { name: true } },
        },
      }),
      prisma.staffRate.findMany({
        where: { staff: { organizationId: orgId } },
        orderBy: { effectiveFrom: "desc" },
        select: { staffId: true, rate: true, effectiveFrom: true },
      }),
    ]);
    type Rate = { staffId: string; rate: { toString(): string; times(n: number): { toString(): string } }; effectiveFrom: Date };
    const rateFor = (staffId: string, date: Date) =>
      (rates as Rate[]).find((r) => r.staffId === staffId && r.effectiveFrom <= date) ?? null;
    csv = toCsv(
      ["Date", "Staff", "Hours", "Task", "Cycle", "Rate/hr (Rp)", "Cost (Rp)"],
      (lines as Array<{ hours: { toString(): string; times(r: unknown): { toString(): string } }; task: string | null; harvest: { name: string } | null; wageEntry: { date: Date; staffId: string; staff: { name: string } } }>).map((l) => {
        const r = rateFor(l.wageEntry.staffId, l.wageEntry.date);
        const cost = r ? r.rate.times(Number(l.hours.toString())).toString() : "";
        return [ymd(l.wageEntry.date), l.wageEntry.staff.name, num(l.hours as never), l.task ?? "", l.harvest?.name ?? "", r ? num(r.rate as never) : "", cost];
      }),
    );
    filename = "wages";
  } else if (type === "inventory") {
    const items = await prisma.item.findMany({
      orderBy: { code: "asc" },
      select: {
        code: true, name: true, unit: true, category: { select: { name: true } },
        batches: { select: { qty: true, price: true, consumptions: { select: { qty: true } } } },
      },
    });
    csv = toCsv(
      ["Code", "Name", "Category", "Unit", "On hand", "Value (Rp)"],
      (items as Array<{ code: string; name: string; unit: string; category: { name: string } | null; batches: Array<{ qty: { toString(): string }; price: { toString(): string }; consumptions: Array<{ qty: { toString(): string } }> }> }>).map((it) => {
        let onHand = 0, value = 0;
        for (const b of it.batches) {
          const consumed = b.consumptions.reduce((s, c) => s + Number(c.qty.toString()), 0);
          const rem = Number(b.qty.toString()) - consumed;
          onHand += rem;
          value += rem * Number(b.price.toString());
        }
        return [it.code, it.name, it.category?.name ?? "", it.unit, onHand.toFixed(3).replace(/\.?0+$/, ""), Math.round(value).toString()];
      }),
    );
    filename = "inventory";
  } else {
    return new Response("Unknown export type", { status: 404 });
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sparmanik-${filename}-${ymd(new Date())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
