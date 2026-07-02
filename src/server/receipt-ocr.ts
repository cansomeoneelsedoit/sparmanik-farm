import sharp from "sharp";

import { ask, askVision, type VisionMediaType } from "@/server/ai-chain";
import { extractJson } from "@/server/json-extract";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";

/**
 * Structured result returned to the expense dialog after a receipt is
 * OCR'd. Every field is optional — the AI returns null when it isn't
 * sure, and the UI uses that to decide whether to overwrite an existing
 * form value.
 */
export type ReceiptFields = {
  payee: string | null;
  amount: string | null; // Plain decimal string, no currency symbol
  /** ISO YYYY-MM-DD when recognised, else null. */
  date: string | null;
  category: string | null;
  paymentMethod: string | null;
  description: string | null;
  /** Whole receipt text for debugging — not surfaced in the UI by default. */
  rawText: string | null;
};

const EMPTY: ReceiptFields = {
  payee: null,
  amount: null,
  date: null,
  category: null,
  paymentMethod: null,
  description: null,
  rawText: null,
};

const PROMPT = `You read receipts and bills from a hydroponic farm in Indonesia and extract structured data.

Reply with ONE JSON object, nothing else. Use this exact shape:
{
  "payee": string | null,        // The vendor / shop / contractor — who got paid
  "amount": string | null,       // Total paid as a plain decimal, no currency symbol, no thousands separator. e.g. "150000.00"
  "date": string | null,         // ISO YYYY-MM-DD
  "category": string | null,     // closest one of: ${EXPENSE_CATEGORIES.join(", ")}
  "paymentMethod": string | null,// One of: "Cash", "Bank transfer", "Card", "E-wallet"
  "description": string | null,  // Brief one-liner describing what was bought / paid for
  "rawText": string | null       // Full visible text from the receipt, line-broken with \\n
}

Rules:
- Indonesian rupiah amounts often have dots as thousand separators ("Rp 150.000"). Treat those dots as separators, not decimals. Return "150000.00".
- If the receipt is faint or partially obscured, return null for the uncertain field rather than guessing.
- Never include currency symbols, "IDR", "Rp", or trailing zeros for cents you can't see.
- The image MAY not be a receipt at all. If so, return all-null fields and put a short explanation in description.
- Output ONLY the JSON object. No markdown, no commentary.`;

/** Detection union — what the caller hands us. */
export type ReceiptSource =
  | { kind: "image"; buffer: Buffer; mediaType: "image/jpeg" | "image/png" }
  | { kind: "pdf"; buffer: Buffer }
  | { kind: "docx"; buffer: Buffer }
  | { kind: "xlsx"; buffer: Buffer };

/**
 * Detect the source kind from the file's MIME type + filename. Anything
 * we can't classify is rejected so we don't burn vision tokens on
 * mystery binary blobs.
 */
export function classifyReceiptFile(file: File): ReceiptSource | null {
  const mime = file.type.toLowerCase();
  const lower = file.name.toLowerCase();
  if (mime === "image/jpeg" || mime === "image/jpg" || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    // Buffer filled in by caller.
    return { kind: "image", buffer: Buffer.alloc(0), mediaType: "image/jpeg" };
  }
  if (mime === "image/png" || lower.endsWith(".png")) {
    return { kind: "image", buffer: Buffer.alloc(0), mediaType: "image/png" };
  }
  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    return { kind: "pdf", buffer: Buffer.alloc(0) };
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword" ||
    lower.endsWith(".docx") ||
    lower.endsWith(".doc")
  ) {
    return { kind: "docx", buffer: Buffer.alloc(0) };
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls")
  ) {
    return { kind: "xlsx", buffer: Buffer.alloc(0) };
  }
  return null;
}

/**
 * Pipe a receipt through the AI chain. Images + PDFs go through
 * `askVision()`; Word + Excel get text-extracted server-side and go
 * through the cheaper `ask()` chain (every provider can read text).
 *
 * Falls back gracefully on extractor failures — returns blank fields
 * rather than throwing, so the dialog never gets stuck.
 */
export async function ocrReceipt(src: ReceiptSource): Promise<ReceiptFields> {
  let text: string;
  if (src.kind === "image") {
    // Pre-shrink so we don't pay for vision tokens on a 12MP camera
    // dump. 1600px on the longest side is plenty for receipt OCR.
    const normalised = await sharp(src.buffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    text = await askVision({
      prompt: PROMPT,
      imageBase64: normalised.toString("base64"),
      imageMediaType: "image/jpeg",
      json: true,
      maxTokens: 1024,
      timeoutMs: 90_000,
    });
  } else if (src.kind === "pdf") {
    text = await askVision({
      prompt: PROMPT,
      imageBase64: src.buffer.toString("base64"),
      imageMediaType: "application/pdf" as VisionMediaType,
      json: true,
      maxTokens: 1024,
      timeoutMs: 90_000,
    });
  } else if (src.kind === "docx") {
    // Mammoth's "extractRawText" is dramatically faster than the HTML
    // conversion path and good enough for a receipt's plain-text content.
    let docText = "";
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: src.buffer });
      docText = value;
    } catch (e) {
      return { ...EMPTY, rawText: e instanceof Error ? e.message : "docx extract failed" };
    }
    text = await ask({
      prompt: `${PROMPT}\n\nHere is the document text:\n\n${docText}`,
      json: true,
      maxTokens: 1024,
      disableThinking: true,
      timeoutMs: 60_000,
    });
  } else if (src.kind === "xlsx") {
    let sheetText = "";
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require("xlsx");
      const wb = XLSX.read(src.buffer, { type: "buffer" });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) {
        return { ...EMPTY, rawText: "empty spreadsheet" };
      }
      sheetText = XLSX.utils.sheet_to_csv(wb.Sheets[firstSheet]);
    } catch (e) {
      return { ...EMPTY, rawText: e instanceof Error ? e.message : "xlsx extract failed" };
    }
    text = await ask({
      prompt: `${PROMPT}\n\nHere is the spreadsheet as CSV (first sheet):\n\n${sheetText}`,
      json: true,
      maxTokens: 1024,
      disableThinking: true,
      timeoutMs: 60_000,
    });
  } else {
    return { ...EMPTY, rawText: "unsupported file type" };
  }

  try {
    const parsed = extractJson<Partial<ReceiptFields>>(text);
    return {
      payee: typeof parsed.payee === "string" ? parsed.payee : null,
      amount: normaliseAmount(parsed.amount),
      date: typeof parsed.date === "string" ? parsed.date : null,
      category: typeof parsed.category === "string" ? parsed.category : null,
      paymentMethod:
        typeof parsed.paymentMethod === "string" ? parsed.paymentMethod : null,
      description:
        typeof parsed.description === "string" ? parsed.description : null,
      rawText: typeof parsed.rawText === "string" ? parsed.rawText : null,
    };
  } catch {
    return { ...EMPTY, rawText: text || null };
  }
}

// ============================================================================
// Multi-line expense SHEET OCR — a handwritten page listing many purchases at
// once (Indonesian field-purchase sheets). Extracts a LIST of line items, not
// one total. Reuses the same image prep + vision chain + JSON parsing.
// ============================================================================

export type ExpenseSheetLine = {
  description: string;
  amount: string; // plain decimal, normalised
  category: string | null;
  isWage: boolean;
};

export type ExpenseSheetResult = {
  lines: ExpenseSheetLine[];
  /** The grand total written on the sheet (if any) — for reconciliation only. */
  sheetTotal: string | null;
  rawText: string | null;
};

const SHEET_PROMPT = `You are reading a HANDWRITTEN expense list from a hydroponic melon farm in Indonesia. Transcribe EVERY purchase/payment line into structured data. The handwriting may be messy — make your best reading rather than giving up.

The page lists things staff bought or paid for at different places (materials, tools, chemicals, food "makan", wages "Gaji"), each with a rupiah amount on the right. It also has running SUBTOTALS and a GRAND TOTAL — those are sums, NOT purchases.

Reply with ONE JSON object only — no markdown, no commentary, no transcription of anything else:
{
  "lines": [
    { "description": string, "amount": string, "category": string | null, "isWage": boolean }
  ],
  "sheetTotal": string | null
}

For each line:
- "description": what was bought / paid for, short. Keep the original Indonesian word if unsure ("Beli Plastik" -> "Plastik", "Racun Rumput" -> "Racun Rumput", "makan" -> "Makan").
- "amount": the line's rupiah amount as a plain integer. Dots are thousand separators: "45.000" -> "45000", "1.110.000" -> "1110000". For "3 x 15.000 = 45.000" use the result, 45000.
- "category": the closest of: ${EXPENSE_CATEGORIES.join(", ")} ("Wages" for Gaji, "Food" for makan, "Chemicals" for racun/herbicide, else "Materials"/"Tools"/"Transport"/"Other").
- "isWage": true for any wage/salary line ("Gaji", "upah", "kernet" helper pay).

Rules:
- ONLY transcribe lines you can actually read in THIS image. If the image is blank, too blurry/dark to read, or is not an expense list, return {"lines": [], "sheetTotal": null}. NEVER invent, guess, or fill in plausible-looking expenses that are not clearly written on the page — a wrong number is worse than a missing one.
- Otherwise include EVERY line that has its own amount. Do not stop early.
- DO NOT output subtotals or the grand total as lines (they are sums of the lines above, often boxed or underlined). Put only the final grand total in "sheetTotal".
- Never include "Rp", symbols, or invented cents.
- Be concise. Output ONLY the JSON object.`;

/**
 * OCR a whole expense sheet into a list of line items. Same source kinds as
 * ocrReceipt (image / pdf via vision; docx / xlsx via text). Returns blank
 * lines[] on any failure rather than throwing, so the dialog never hangs.
 */
export async function ocrExpenseSheet(src: ReceiptSource): Promise<ExpenseSheetResult> {
  const EMPTY_SHEET: ExpenseSheetResult = { lines: [], sheetTotal: null, rawText: null };
  let text: string;
  if (src.kind === "image") {
    const normalised = await sharp(src.buffer)
      .rotate()
      // A full handwritten page needs more detail than a small receipt, so
      // allow 2200px on the longest side before the model reads it.
      .resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    text = await askVision({
      prompt: SHEET_PROMPT,
      imageBase64: normalised.toString("base64"),
      imageMediaType: "image/jpeg",
      json: true,
      maxTokens: 4000,
      disableThinking: true,
      timeoutMs: 120_000,
    });
  } else if (src.kind === "pdf") {
    text = await askVision({
      prompt: SHEET_PROMPT,
      imageBase64: src.buffer.toString("base64"),
      imageMediaType: "application/pdf" as VisionMediaType,
      json: true,
      maxTokens: 4000,
      disableThinking: true,
      timeoutMs: 120_000,
    });
  } else if (src.kind === "docx") {
    let docText = "";
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: src.buffer });
      docText = value;
    } catch (e) {
      return { ...EMPTY_SHEET, rawText: e instanceof Error ? e.message : "docx extract failed" };
    }
    text = await ask({
      prompt: `${SHEET_PROMPT}\n\nHere is the document text:\n\n${docText}`,
      json: true,
      maxTokens: 4000,
      disableThinking: true,
      timeoutMs: 90_000,
    });
  } else if (src.kind === "xlsx") {
    let sheetText = "";
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require("xlsx");
      const wb = XLSX.read(src.buffer, { type: "buffer" });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) return { ...EMPTY_SHEET, rawText: "empty spreadsheet" };
      sheetText = XLSX.utils.sheet_to_csv(wb.Sheets[firstSheet]);
    } catch (e) {
      return { ...EMPTY_SHEET, rawText: e instanceof Error ? e.message : "xlsx extract failed" };
    }
    text = await ask({
      prompt: `${SHEET_PROMPT}\n\nHere is the spreadsheet as CSV (first sheet):\n\n${sheetText}`,
      json: true,
      maxTokens: 4000,
      disableThinking: true,
      timeoutMs: 90_000,
    });
  } else {
    return { ...EMPTY_SHEET, rawText: "unsupported file type" };
  }

  try {
    const parsed = extractJson<{
      lines?: { description?: unknown; amount?: unknown; category?: unknown; isWage?: unknown }[];
      sheetTotal?: unknown;
      rawText?: unknown;
    }>(text);
    const rawLines = Array.isArray(parsed.lines) ? parsed.lines : [];
    const lines: ExpenseSheetLine[] = [];
    for (const l of rawLines) {
      const amount = normaliseAmount(l.amount);
      if (!amount) continue; // drop lines with no usable amount
      const description =
        typeof l.description === "string" && l.description.trim()
          ? l.description.trim()
          : "(unlabelled)";
      lines.push({
        description,
        amount,
        category: typeof l.category === "string" && l.category.trim() ? l.category.trim() : null,
        isWage: l.isWage === true,
      });
    }
    return {
      lines,
      sheetTotal: normaliseAmount(parsed.sheetTotal),
      // With rows parsed we don't need the raw text. With ZERO rows, hand back
      // the model's reply so the UI can show what it actually saw (blank page,
      // refusal, truncation) instead of a silent empty table.
      rawText: lines.length === 0 ? (text ? text.slice(0, 1500) : null) : null,
    };
  } catch {
    return { ...EMPTY_SHEET, rawText: text ? text.slice(0, 1500) : null };
  }
}

/**
 * Defensive: the model is told to return "150000.00" but sometimes still
 * emits "Rp 150.000". Strip non-digits/dot, collapse to a plain decimal.
 */
function normaliseAmount(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const cleaned = s.replace(/[^0-9.,]/g, "");
  if (!cleaned) return null;
  const dots = cleaned.split(".").length - 1;
  const commas = cleaned.split(",").length - 1;
  let normalised = cleaned;
  if (commas > 0 && dots > 0) {
    normalised = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (commas === 1 && dots === 0) {
    normalised = cleaned.replace(",", ".");
  } else if (dots > 1) {
    normalised = cleaned.replace(/\./g, "");
  } else if (dots === 1 && commas === 0) {
    // Single dot: in Indonesian formatting a dot followed by exactly 3 digits is
    // a thousands separator ("150.000" = 150000), NOT a decimal point — IDR has
    // no cents in practice. Without this, "150.000" parsed as Rp 150 — a silent
    // 1000x under-count (app review #13). A 1–2 digit fraction ("150000.50") is
    // left as a real decimal.
    const frac = cleaned.split(".")[1] ?? "";
    if (frac.length === 3) normalised = cleaned.replace(".", "");
  }
  if (!/^[0-9]+(\.[0-9]+)?$/.test(normalised)) return null;
  return normalised;
}
