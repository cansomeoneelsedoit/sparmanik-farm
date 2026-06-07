import sharp from "sharp";

import { ask, askVision, type VisionMediaType } from "@/server/ai-chain";
import { extractJson } from "@/server/json-extract";

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
  "category": string | null,     // One of: "Contractor", "Utilities", "Rent", "Transport", "Repairs", "Permits / fees", "Marketing", "Other"
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
  }
  if (!/^[0-9]+(\.[0-9]+)?$/.test(normalised)) return null;
  return normalised;
}
