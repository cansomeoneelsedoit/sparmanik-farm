"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { recordAction } from "@/server/audit";
import { Decimal, type TransactionClient } from "@/server/decimal";
import { saveFileUpload, saveImageUpload } from "@/server/uploads";
import {
  classifyReceiptFile,
  ocrReceipt,
  type ReceiptFields,
  type ReceiptSource,
} from "@/server/receipt-ocr";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

async function userId(): Promise<string | null> {
  return (await auth())?.user?.id ?? null;
}

const expenseSchema = z.object({
  date: z.string().min(1),
  amount: z.string().regex(/^[0-9.]+$/),
  category: z.string().optional().nullable(),
  payee: z.string().min(1, "Who got paid?"),
  description: z.string().optional().nullable(),
  harvestId: z.string().optional().nullable(),
  paymentMethod: z.string().optional().nullable(),
  receiptPath: z.string().optional().nullable(),
});

export async function uploadExpenseReceipt(
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const s = await auth();
  if (!s?.user?.id) return { ok: false, error: "Not signed in" };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };
  try {
    const saved = await saveImageUpload(file, "expenses");
    return { ok: true, data: { path: saved.path } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed" };
  }
}

/**
 * Run OCR on a freshly-captured receipt. Accepts JPEG, PNG, PDF, Word
 * (.docx), and Excel (.xlsx). Returns extracted fields the client uses
 * to pre-fill the expense form.
 *
 * When `keepPhoto` is "1" the file is also persisted under
 * uploads/expenses/ — images go through the sharp pipeline (resize +
 * webp); PDFs / Word / Excel are stored bit-for-bit so the user can
 * download the original later. When `keepPhoto` is "0" the file is
 * processed and discarded; nothing hits disk.
 */
export async function extractReceipt(
  formData: FormData,
): Promise<
  ActionResult<{ fields: ReceiptFields; path: string | null }>
> {
  const s = await auth();
  if (!s?.user?.id) return { ok: false, error: "Not signed in" };
  const file = formData.get("file");
  const keepPhotoRaw = formData.get("keepPhoto");
  const keepPhoto = keepPhotoRaw === "1" || keepPhotoRaw === "true";
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };

  const classification = classifyReceiptFile(file);
  if (!classification) {
    return {
      ok: false,
      error: `Unsupported file type "${file.type || file.name.split(".").pop()}". Allowed: JPG, PNG, PDF, Word (.docx), Excel (.xlsx).`,
    };
  }

  try {
    // Read the file once, then branch. Saving and OCR-ing both consume
    // the bytes, so we hold the buffer locally and pass it to both
    // pipelines rather than re-reading the File stream twice.
    const buffer = Buffer.from(await file.arrayBuffer());
    const source = { ...classification, buffer } as ReceiptSource;
    const fields = await ocrReceipt(source);

    let storedPath: string | null = null;
    if (keepPhoto) {
      // Images get the sharp pipeline (resize + webp). PDFs / Word /
      // Excel keep their original bytes via the generic file saver so
      // they remain viewable in their native readers.
      if (classification.kind === "image") {
        storedPath = (await saveImageUpload(file, "expenses")).path;
      } else {
        storedPath = (await saveFileUpload(file, "expenses")).path;
      }
    }
    return { ok: true, data: { fields, path: storedPath } };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message.includes("ANTHROPIC_API_KEY") ||
            e.message.includes("No AI provider")
            ? "AI isn't configured — add a key under Settings → AI keys."
            : e.message
          : "OCR failed",
    };
  }
}

export async function createExpense(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed" };
  }
  const uid = await userId();
  try {
    const expense = await prisma.$transaction(async (tx: TransactionClient) => {
      const e = await tx.expense.create({
        data: {
          date: new Date(parsed.data.date),
          amount: new Decimal(parsed.data.amount),
          category: parsed.data.category || null,
          payee: parsed.data.payee,
          description: parsed.data.description || null,
          harvestId: parsed.data.harvestId || null,
          paymentMethod: parsed.data.paymentMethod || null,
          receiptPath: parsed.data.receiptPath || null,
        },
      });
      await recordAction(tx, {
        type: "expense.create",
        entityType: "Expense",
        entityId: e.id,
        description: `Expense: ${parsed.data.payee} (${parsed.data.amount})`,
        userId: uid,
        payload: { amount: parsed.data.amount, harvestId: parsed.data.harvestId },
      });
      return e;
    });
    revalidatePath("/expenses");
    revalidatePath("/financials");
    if (parsed.data.harvestId) {
      revalidatePath(`/harvest/${parsed.data.harvestId}`);
    }
    return { ok: true, data: { id: expense.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create expense" };
  }
}

export async function updateExpense(id: string, input: unknown): Promise<ActionResult> {
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const existing = await prisma.expense.findUnique({ where: { id }, select: { harvestId: true } });
  await prisma.expense.update({
    where: { id },
    data: {
      date: new Date(parsed.data.date),
      amount: new Decimal(parsed.data.amount),
      category: parsed.data.category || null,
      payee: parsed.data.payee,
      description: parsed.data.description || null,
      harvestId: parsed.data.harvestId || null,
      paymentMethod: parsed.data.paymentMethod || null,
      receiptPath: parsed.data.receiptPath || null,
    },
  });
  revalidatePath("/expenses");
  revalidatePath("/financials");
  if (existing?.harvestId) revalidatePath(`/harvest/${existing.harvestId}`);
  if (parsed.data.harvestId) revalidatePath(`/harvest/${parsed.data.harvestId}`);
  return { ok: true };
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const existing = await prisma.expense.findUnique({ where: { id }, select: { harvestId: true } });
  await prisma.expense.delete({ where: { id } });
  revalidatePath("/expenses");
  revalidatePath("/financials");
  if (existing?.harvestId) revalidatePath(`/harvest/${existing.harvestId}`);
  return { ok: true };
}
