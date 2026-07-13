"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { recordAction } from "@/server/audit";
import { adjustHarvestedTotal, createSaleTx, distributeCartTotal } from "@/server/sales";
import { sendReceiptEmail } from "@/server/mailer";
import { Decimal, type TransactionClient } from "@/server/decimal";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const numeric = z.string().regex(/^[0-9]+(\.[0-9]+)?$/, "Number");

const posLineSchema = z.object({
  produceId: z.string().min(1),
  grade: z.enum(["A", "B", "C", "D"]),
  weight: numeric,
  pricePerKg: numeric,
  packagingItemId: z.string().optional(),
  packagingQty: z.string().optional(),
  packagingMode: z.enum(["included", "ontop"]).optional(),
  packagingChargePerUnit: z.string().optional(),
});

const posCartSchema = z.object({
  harvestId: z.string().min(1),
  date: z.string().min(1),
  customerId: z.string().optional(),
  method: z.enum(["CASH", "QRIS", "CARD", "TRANSFER"]),
  /** Cash only — amount handed over and change given back (for the receipt). */
  tendered: z.string().optional(),
  changeDue: z.string().optional(),
  /** Free-text ref for "other method" (typed by staff). */
  reference: z.string().max(200).optional(),
  /** Optional whole-basket custom total (haggled round number). When lower than
   *  the natural total, it's split pro-rata across the lines. */
  discountTotal: z.string().optional(),
  lines: z.array(posLineSchema).min(1),
});

/** Natural charged amount for a line (weight × price + any on-top packaging). */
function lineNatural(l: z.infer<typeof posLineSchema>): Decimal {
  let amt = new Decimal(l.weight).times(l.pricePerKg);
  if (l.packagingItemId && l.packagingMode === "ontop" && l.packagingQty) {
    amt = amt.plus(new Decimal(l.packagingChargePerUnit || "0").times(l.packagingQty));
  }
  return amt;
}

/**
 * Record a POS basket: N produce lines sold together and paid once. Creates all
 * Sale rows + a single record-only PosPayment (PAID) in ONE transaction, so a
 * partial-cart failure is impossible. Reuses the verified `createSaleTx` path.
 *
 * A whole-basket discount (`discountTotal` below the natural total) is split
 * pro-rata across the lines as per-line `amountOverride`s — floored per line
 * with the rounding remainder absorbed by the last line, so the line overrides
 * sum EXACTLY to the discounted total.
 */
export async function recordPosSale(
  input: unknown,
): Promise<ActionResult<{ paymentId: string }>> {
  const parsed = posCartSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const c = parsed.data;
  const userId = (await auth())?.user?.id ?? null;

  // Pro-rata custom-total distribution (discount or markup), all whole rupiah.
  const naturals = c.lines.map(lineNatural);
  const validTotal =
    c.discountTotal !== undefined &&
    c.discountTotal.trim() !== "" &&
    /^[0-9]+(\.[0-9]+)?$/.test(c.discountTotal.trim());
  const { overrides, gross } = distributeCartTotal(
    naturals,
    validTotal ? new Decimal(c.discountTotal as string) : null,
  );
  // A zero-total basket is meaningless (and the UI can't build one — every line
  // needs weight > 0 and price > 0). Reject at the trust boundary.
  if (gross.lte(0)) return { ok: false, error: "Cart total must be greater than zero" };

  try {
    const paymentId = await prisma.$transaction(async (tx: TransactionClient) => {
      const isCash = c.method === "CASH";
      const payment = await tx.posPayment.create({
        data: {
          method: c.method,
          status: "PAID",
          provider: "record-only",
          currency: "IDR",
          grossAmount: gross,
          tendered: isCash && c.tendered ? new Decimal(c.tendered) : null,
          changeDue: isCash && c.changeDue ? new Decimal(c.changeDue) : null,
          note: c.reference?.trim() || null,
          paidAt: new Date(),
        },
      });

      for (let i = 0; i < c.lines.length; i++) {
        const l = c.lines[i];
        await createSaleTx(
          tx,
          {
            harvestId: c.harvestId,
            date: c.date,
            customerId: c.customerId,
            produceId: l.produceId,
            grade: l.grade,
            weight: l.weight,
            pricePerKg: l.pricePerKg,
            packagingItemId: l.packagingItemId,
            packagingQty: l.packagingQty,
            packagingMode: l.packagingMode,
            packagingChargePerUnit: l.packagingChargePerUnit,
            amountOverride: overrides[i],
            // Register sales come off the picked pile on the table — they
            // draw from the unsold pool, never grow the harvested total.
            fromUnsold: true,
          },
          { userId, paymentStatus: "PAID", paymentId: payment.id },
        );
        // Clamp the pool so a register day that outsells the recorded
        // leftover bumps the harvested total instead of going negative.
        await adjustHarvestedTotal(tx, c.harvestId, l.produceId, new Decimal(0));
      }

      await recordAction(tx, {
        type: "pos.record_sale",
        entityType: "PosPayment",
        entityId: payment.id,
        description: `POS sale — ${c.lines.length} line${c.lines.length > 1 ? "s" : ""}`,
        userId,
        payload: {
          harvestId: c.harvestId,
          method: c.method,
          gross: gross.toFixed(0),
          lines: c.lines.length,
        },
      });

      return payment.id;
    }, {
      // A big wholesale basket does many sequential writes; the default 5s
      // interactive-transaction timeout can strand a sale AFTER cash was taken
      // on a slow connection. Widen it (same pattern as inventory/actions.ts).
      maxWait: 15_000,
      timeout: 120_000,
    });

    revalidatePath("/sales");
    revalidatePath(`/harvest/${c.harvestId}`);
    revalidatePath("/financials");
    return { ok: true, data: { paymentId } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to record sale" };
  }
}

/**
 * Email the receipt for a POS payment to a customer address. Any signed-in
 * staff member can send (it's part of taking a sale); the FROM account is the
 * org's Gmail configured in Settings → Email. Every send lands a copy in that
 * Gmail's Sent folder.
 */
export async function emailPosReceipt(input: unknown): Promise<ActionResult> {
  const parsed = z
    .object({ paymentId: z.string().min(1), to: z.string().email() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not signed in." };
  return sendReceiptEmail(parsed.data.paymentId, parsed.data.to);
}
