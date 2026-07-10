import nodemailer from "nodemailer";

import { prisma } from "@/server/prisma";

/**
 * Outgoing mail via the org's Gmail account (SMTP + App Password, stored in
 * Settings → Email like the AI keys). Sending through smtp.gmail.com means
 * every message automatically lands in the Gmail account's own Sent folder —
 * the permanent purchase record Boyd wants.
 *
 * Failures update MailAccount.lastStatus/lastError so the settings tab shows
 * account health, same pattern as AiProviderKey.
 */

type MailAccountRow = {
  id: string;
  email: string;
  appPassword: string;
  enabled: boolean;
};

async function loadAccount(): Promise<MailAccountRow | null> {
  const acc = (await prisma.mailAccount.findFirst({
    where: { enabled: true },
    orderBy: { createdAt: "asc" },
  })) as MailAccountRow | null;
  return acc;
}

async function stampResult(id: string, ok: boolean, error?: string) {
  await prisma.mailAccount.update({
    where: { id },
    data: {
      lastStatus: ok ? "ok" : "error",
      lastUsedAt: new Date(),
      lastError: ok ? null : (error ?? "unknown error").slice(0, 500),
    },
  });
}

function transportFor(acc: MailAccountRow) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: acc.email, pass: acc.appPassword },
    connectionTimeout: 20_000,
    socketTimeout: 30_000,
  });
}

/** Send an email from the org's configured Gmail. Returns ok/error. */
export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const acc = await loadAccount();
  if (!acc) return { ok: false, error: "No email account set up (Settings → Email)." };
  try {
    const transport = transportFor(acc);
    await transport.sendMail({
      from: `"Sparmanik Farm" <${acc.email}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    await stampResult(acc.id, true);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Send failed";
    await stampResult(acc.id, false, msg);
    return { ok: false, error: msg };
  }
}

const rp = (v: { toString(): string }) =>
  "Rp " + Math.round(Number(v.toString())).toLocaleString("id-ID");

/**
 * Build + send the receipt email for a POS payment. HTML mirrors the printed
 * receipt (Indonesian labels — customer-facing, original produce names).
 */
export async function sendReceiptEmail(
  paymentId: string,
  to: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const payment = await prisma.posPayment.findFirst({
    where: { id: paymentId },
    include: {
      sales: {
        orderBy: { createdAt: "asc" },
        include: { produce: { select: { name: true } }, customer: { select: { name: true } } },
      },
    },
  });
  if (!payment) return { ok: false, error: "Sale not found" };

  type Line = {
    id: string;
    grade: string;
    weight: { toString(): string };
    amount: { toString(): string };
    pricePerKg: { toString(): string };
    produce: { name: string };
    customer: { name: string } | null;
  };
  const sales = payment.sales as Line[];
  const when = payment.paidAt ?? payment.createdAt;
  const dateStr = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(when);
  const methodId: Record<string, string> = { CASH: "Tunai", QRIS: "QRIS", CARD: "Kartu", TRANSFER: "Transfer" };
  const customerName = sales.find((s) => s.customer)?.customer?.name ?? null;

  const rows = sales
    .map(
      (s) => `
      <tr>
        <td style="padding:6px 0;border-bottom:1px dashed #e4e4e7;">
          ${s.produce.name} <span style="color:#71717a;">(${s.grade})</span><br/>
          <span style="color:#71717a;font-size:12px;">${s.weight.toString()} kg × ${rp(s.pricePerKg)}</span>
        </td>
        <td style="padding:6px 0;border-bottom:1px dashed #e4e4e7;text-align:right;vertical-align:top;white-space:nowrap;">${rp(s.amount)}</td>
      </tr>`,
    )
    .join("");

  const detail = (label: string, value: string) =>
    `<tr><td style="padding:2px 0;color:#52525b;font-size:13px;">${label}</td><td style="padding:2px 0;text-align:right;font-size:13px;">${value}</td></tr>`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:400px;margin:0 auto;color:#18181b;">
    <div style="text-align:center;padding:16px 0 8px;">
      <div style="font-size:18px;font-weight:bold;">Sparmanik Farm</div>
      <div style="font-size:12px;color:#71717a;">${dateStr}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <table style="width:100%;border-collapse:collapse;margin-top:8px;">
      <tr>
        <td style="padding:8px 0;font-weight:bold;">Total</td>
        <td style="padding:8px 0;text-align:right;font-weight:bold;font-size:16px;">${rp(payment.grossAmount)}</td>
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse;border-top:1px dashed #e4e4e7;padding-top:6px;">
      ${detail("Pembayaran", methodId[payment.method] ?? payment.method)}
      ${payment.tendered ? detail("Tunai", rp(payment.tendered)) : ""}
      ${payment.changeDue ? detail("Kembalian", rp(payment.changeDue)) : ""}
      ${customerName ? detail("Pelanggan", customerName) : ""}
    </table>
    <div style="text-align:center;color:#71717a;font-size:12px;padding:16px 0;">Terima kasih 🙏</div>
  </div>`;

  const text = [
    "Sparmanik Farm",
    dateStr,
    ...sales.map((s) => `- ${s.produce.name} ${s.grade} ${s.weight.toString()}kg — ${rp(s.amount)}`),
    `Total: ${rp(payment.grossAmount)} (${methodId[payment.method] ?? payment.method})`,
    "Terima kasih",
  ].join("\n");

  return sendMail({
    to,
    subject: `Struk Sparmanik Farm — ${dateStr}`,
    html,
    text,
  });
}
