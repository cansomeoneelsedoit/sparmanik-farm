/**
 * Pull plain text out of an uploaded document so any LLM in the chain (incl.
 * text-only OpenAI-compatible endpoints) can read it. PDF via pdf-parse, Word
 * via mammoth, text/markdown/csv as UTF-8. Long documents are truncated with a
 * marker — the whole SOP book is ~60k chars, which fits comfortably.
 */
import path from "node:path";

export const MAX_DOC_CHARS = 120_000;

export type DocKind = "pdf" | "docx" | "text";

const TEXT_EXT = new Set([".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".log"]);

export function detectDocKind(file: { name: string; type: string }): DocKind | null {
  const ext = path.extname(file.name).toLowerCase();
  const t = (file.type || "").toLowerCase();
  if (ext === ".pdf" || t === "application/pdf") return "pdf";
  if (
    ext === ".docx" ||
    t === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  if (TEXT_EXT.has(ext) || t.startsWith("text/") || t === "application/json") return "text";
  return null;
}

export async function extractDocumentText(file: File): Promise<{ text: string; kind: DocKind; pages?: number }> {
  const kind = detectDocKind(file);
  if (!kind) throw new Error("Unsupported file — use PDF, Word (.docx), or a text file");
  const buf = Buffer.from(await file.arrayBuffer());
  let text = "";
  let pages: number | undefined;
  if (kind === "pdf") {
    // pdf-parse ships CommonJS; dynamic import keeps it off the client bundle.
    const mod = (await import("pdf-parse")) as unknown as { default?: typeof import("pdf-parse") } & typeof import("pdf-parse");
    const parse = mod.default ?? mod;
    const r = await parse(buf);
    text = r.text ?? "";
    pages = r.numpages;
  } else if (kind === "docx") {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ buffer: buf });
    text = r.value ?? "";
  } else {
    text = buf.toString("utf8");
  }
  text = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  if (!text) throw new Error("No readable text found in that file (scanned PDF? try a photo of the page instead)");
  if (text.length > MAX_DOC_CHARS) {
    text = text.slice(0, MAX_DOC_CHARS) + `\n\n[… truncated — first ${MAX_DOC_CHARS.toLocaleString()} characters shown]`;
  }
  return { text, kind, pages };
}
