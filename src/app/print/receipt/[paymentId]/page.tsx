import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getActiveOrgId } from "@/server/org";
import { prisma } from "@/server/prisma";
import { MoneyDual } from "@/components/shared/money";

import { ReceiptToolbar } from "./receipt-toolbar";

export const dynamic = "force-dynamic";

const METHOD_ID: Record<string, string> = {
  CASH: "Tunai",
  QRIS: "QRIS",
  CARD: "Kartu",
  TRANSFER: "Transfer",
};

const rp = (v: { toString(): string }) => "Rp " + Math.round(Number(v.toString())).toLocaleString("id-ID");

/**
 * Printable POS receipt — a narrow, self-contained thermal-style sheet outside
 * the (app) layout (its own clean sheet). Labels are Indonesian (customer-facing).
 * Reached from the register's success screen; shareable via WhatsApp or Save-as-PDF.
 */
export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const orgId = await getActiveOrgId();
  if (!orgId) notFound();

  const { paymentId } = await params;
  const { auto } = await searchParams;

  const payment = await prisma.posPayment.findFirst({
    where: { id: paymentId },
    include: {
      sales: {
        orderBy: { createdAt: "asc" },
        include: { produce: { select: { name: true } }, customer: { select: { name: true } } },
      },
    },
  });
  if (!payment || payment.organizationId !== orgId) notFound();

  // The org-scoping extension widens the query type — annotate the line shape.
  type ReceiptSale = {
    id: string;
    grade: string;
    weight: { toString(): string };
    amount: { toString(): string };
    pricePerKg: { toString(): string };
    produce: { name: string };
    customer: { name: string } | null;
  };
  const sales = payment.sales as ReceiptSale[];

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  const when = payment.paidAt ?? payment.createdAt;
  const dateStr = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(when);
  const customerName = sales.find((s) => s.customer)?.customer?.name ?? null;
  const grossStr = payment.grossAmount.toString();

  // Plain-text summary for the WhatsApp share.
  const shareText = [
    org?.name ?? "Sparmanik Farm",
    dateStr,
    ...sales.map((s) => `- ${s.produce.name} ${s.grade} ${s.weight.toString()}kg — ${rp(s.amount)}`),
    `Total: ${rp(payment.grossAmount)} (${METHOD_ID[payment.method] ?? payment.method})`,
    customerName ? `Pelanggan: ${customerName}` : "",
    "Terima kasih 🙏",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="min-h-screen bg-zinc-100 py-6 text-zinc-900">
      <ReceiptToolbar autoPrint={auto === "1"} shareText={shareText} />

      <div className="mx-auto max-w-[360px] bg-white p-5 shadow-sm print:shadow-none">
        <div className="mb-3 text-center">
          <div className="text-lg font-bold">{org?.name ?? "Sparmanik Farm"}</div>
          <div className="text-xs text-zinc-500">{dateStr}</div>
        </div>

        <div className="border-t border-dashed pt-3 text-sm">
          {sales.map((s) => (
            <div key={s.id} className="mb-2">
              <div className="flex justify-between font-medium">
                <span className="truncate pr-2">
                  {s.produce.name} <span className="text-zinc-500">({s.grade})</span>
                </span>
                <span className="whitespace-nowrap">{rp(s.amount)}</span>
              </div>
              <div className="text-xs text-zinc-500">
                {s.weight.toString()} kg × {rp(s.pricePerKg)}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-dashed pt-3">
          <span className="text-sm font-semibold">Total</span>
          <div className="text-right text-base font-bold">
            <MoneyDual value={grossStr} />
          </div>
        </div>

        <div className="mt-2 space-y-0.5 text-xs text-zinc-600">
          <div className="flex justify-between">
            <span>Pembayaran</span>
            <span>{METHOD_ID[payment.method] ?? payment.method}</span>
          </div>
          {payment.tendered ? (
            <div className="flex justify-between">
              <span>Tunai</span>
              <span>{rp(payment.tendered)}</span>
            </div>
          ) : null}
          {payment.changeDue ? (
            <div className="flex justify-between">
              <span>Kembalian</span>
              <span>{rp(payment.changeDue)}</span>
            </div>
          ) : null}
          {customerName ? (
            <div className="flex justify-between">
              <span>Pelanggan</span>
              <span>{customerName}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-4 border-t border-dashed pt-3 text-center text-xs text-zinc-500">Terima kasih 🙏</div>
      </div>
    </div>
  );
}
