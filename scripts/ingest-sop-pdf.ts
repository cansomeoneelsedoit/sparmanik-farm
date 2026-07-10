/**
 * One-off: ingest an SOP booklet PDF into the SOPs section as a fully
 * BILINGUAL Sop + SopSteps (the viewer's EN/ID toggle then works out of the
 * box, since SopStep already stores bodyEn + bodyId).
 *
 *   docker compose exec web npx tsx scripts/ingest-sop-pdf.ts <path-inside-container> [category]
 *   e.g. docker compose exec web npx tsx scripts/ingest-sop-pdf.ts .sop-ingest.pdf "Melon"
 *
 * The PDF goes to the vision AI chain (Gemini/Anthropic accept PDFs inline).
 * The prompt keeps the ORIGINAL Indonesian wording as bodyId (light cleanup
 * only) and translates to natural English for bodyEn. Idempotent-ish: refuses
 * to run if a Sop with the same titleId already exists.
 */
import { readFileSync } from "node:fs";

import { prisma } from "../src/server/prisma";
import { ask, askVision } from "../src/server/ai-chain";
import { extractJson } from "../src/server/json-extract";

// CHUNKED extraction: model output caps (~8k tokens) truncate any single
// response carrying the whole booklet, so: (1) list the sections, (2) pull
// full Indonesian content a few sections at a time, (3) translate in batches.
const OUTLINE_PROMPT = `This PDF is a hydroponic melon-growing SOP booklet written in Bahasa Indonesia.
List its structure — DO NOT extract the content yet.

Reply with ONLY JSON:
{"titleId":"<booklet title in Indonesian>","titleEn":"<English translation of the title>",
 "descriptionId":"one line","descriptionEn":"one line",
 "sections":["<Indonesian heading of section 1>","<section 2>",...]}
One entry per section/stage in the booklet's own order (typically 8-25).`;

const chunkPrompt = (headings: string[], from: number) => `This PDF is a hydroponic melon-growing SOP booklet in Bahasa Indonesia.
Extract ONLY these sections (numbers ${from + 1}-${from + headings.length} of the booklet), full Indonesian content:
${headings.map((h, i) => `${from + i + 1}. ${h}`).join("\n")}

Rules:
- "bodyId": that section's complete Indonesian content, faithful to the original wording (fix obvious OCR artifacts only). Heading as the first line.
- Keep every number, dose, timing, and measurement exactly.

Reply with ONLY JSON: {"steps":[{"bodyId":"..."}]} — exactly ${headings.length} entries, same order.`;

async function translateBatch(bodies: string[]): Promise<string[]> {
  const prompt = `Translate each numbered Indonesian SOP section below into natural, complete English.
Keep every number, dose, timing, and measurement exactly. Keep the heading as the first line.

${bodies.map((b, i) => `### ${i + 1}\n${b}`).join("\n\n")}

Reply with ONLY JSON: {"translations":["<english for 1>","<english for 2>",...]} — exactly ${bodies.length} entries, same order.`;
  const raw = await ask({ prompt, json: true, maxTokens: 8000, disableThinking: true, timeoutMs: 180_000 });
  const parsed = extractJson<{ translations?: unknown[] }>(raw);
  const t = Array.isArray(parsed.translations) ? parsed.translations : [];
  return bodies.map((b, i) => (typeof t[i] === "string" && (t[i] as string).trim() !== "" ? (t[i] as string).trim() : b));
}

/** Batch translate with a per-section fallback — table-heavy sections can
 *  overflow/derail a batch's JSON; a failed single keeps the Indonesian. */
async function translateResilient(bodies: string[]): Promise<string[]> {
  try {
    return await translateBatch(bodies);
  } catch {
    console.log(`[ingest] translation batch overflowed; retrying singly…`);
    const out: string[] = [];
    for (const b of bodies) {
      try {
        out.push((await translateBatch([b]))[0] ?? b);
      } catch {
        out.push(b); // keep Indonesian rather than abort the whole booklet
      }
    }
    return out;
  }
}

async function main() {
  const path = process.argv[2];
  const category = process.argv[3] || "Melon";
  if (!path) throw new Error("Usage: tsx scripts/ingest-sop-pdf.ts <pdf-path> [category]");

  const pdf = readFileSync(path);
  const pdfB64 = pdf.toString("base64");
  console.log(`[ingest] ${path} (${Math.round(pdf.length / 1024)} KB) → pass 1: outline…`);

  const outlineRaw = await askVision({
    prompt: OUTLINE_PROMPT,
    imageBase64: pdfB64,
    imageMediaType: "application/pdf",
    json: true,
    maxTokens: 3000,
    timeoutMs: 300_000,
  });
  const parsed = extractJson<{
    titleEn?: string;
    titleId?: string;
    descriptionEn?: string;
    descriptionId?: string;
    sections?: unknown[];
  }>(outlineRaw);

  const titleEn = (parsed.titleEn ?? "").trim() || "Melon SOP";
  const titleId = (parsed.titleId ?? "").trim() || titleEn;
  const sections = (parsed.sections ?? [])
    .filter((s): s is string => typeof s === "string" && s.trim() !== "")
    .map((s) => s.trim());
  if (sections.length < 3) throw new Error(`Only ${sections.length} sections found — aborting.`);
  console.log(`[ingest] ${sections.length} sections — pass 2: extracting content in chunks…`);

  const extractChunk = async (headings: string[], from: number): Promise<string[]> => {
    const raw = await askVision({
      prompt: chunkPrompt(headings, from),
      imageBase64: pdfB64,
      imageMediaType: "application/pdf",
      json: true,
      maxTokens: 7500,
      timeoutMs: 300_000,
    });
    const chunk = extractJson<{ steps?: { bodyId?: string }[] }>(raw);
    return (chunk.steps ?? []).map((s) => (s.bodyId ?? "").trim());
  };

  const bodiesId: string[] = [];
  const CHUNK = 3;
  for (let i = 0; i < sections.length; i += CHUNK) {
    const headings = sections.slice(i, i + CHUNK);
    let bodies: string[];
    try {
      bodies = await extractChunk(headings, i);
    } catch {
      // Dense chunk overflowed the model's output — retry one section at a time.
      console.log(`[ingest] chunk ${i + 1}-${i + headings.length} overflowed; retrying singly…`);
      bodies = [];
      for (let k = 0; k < headings.length; k++) {
        try {
          const single = await extractChunk([headings[k]], i + k);
          bodies.push(single[0] ?? "");
        } catch {
          bodies.push(""); // heading-only fallback below
        }
      }
    }
    // Tolerate a short/failed entry (fall back to the heading alone) rather than abort.
    for (let k = 0; k < headings.length; k++) bodiesId.push(bodies[k] || headings[k]);
    console.log(`[ingest] extracted ${Math.min(i + CHUNK, sections.length)}/${sections.length}`);
  }
  console.log(`[ingest] pass 3: translating in batches…`);

  const bodiesEn: string[] = [];
  const BATCH = 5;
  for (let i = 0; i < bodiesId.length; i += BATCH) {
    const chunk = bodiesId.slice(i, i + BATCH);
    bodiesEn.push(...(await translateResilient(chunk)));
    console.log(`[ingest] translated ${Math.min(i + BATCH, bodiesId.length)}/${bodiesId.length}`);
  }
  const steps = bodiesId.map((bodyId, i) => ({ bodyId, bodyEn: bodiesEn[i] }));

  const existing = await prisma.sop.findFirst({ where: { titleId } });
  if (existing) throw new Error(`A SOP titled "${titleId}" already exists (${existing.id}) — aborting.`);

  // CLI has no request context — org-scoped creates need an explicit org id.
  const org = await prisma.organization.findFirst({ select: { id: true } });
  if (!org) throw new Error("No organization found — seed the DB first.");

  const sop = await prisma.sop.create({
    data: {
      organizationId: org.id,
      titleEn,
      titleId,
      descriptionEn: (parsed.descriptionEn ?? "").trim() || null,
      descriptionId: (parsed.descriptionId ?? "").trim() || null,
      category,
      steps: {
        create: steps.map((s, i) => ({ position: i + 1, bodyEn: s.bodyEn, bodyId: s.bodyId })),
      },
    },
    select: { id: true },
  });
  console.log(`[ingest] Created SOP ${sop.id} — "${titleEn}" / "${titleId}" with ${steps.length} steps.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
