import Anthropic from "@anthropic-ai/sdk";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { readUpload, readUploadAsBase64 } from "@/server/uploads";

const SYSTEM_PROMPT = `You are the operations assistant for Sparmanik Farm, a hydroponic farm in Indonesia growing primarily melon, chili, and seasonal greens. You help the operator make decisions about inventory, harvests, tasks, staff scheduling, and nutrient recipes. Be concise (3-5 sentences unless detailed steps are requested), practical, and pragmatic. Use IDR (rupiah) for prices. When the user attaches a photo, describe what you see and answer their question using both the image and the farm context. When uncertain, ask for the missing detail rather than guessing.

GREENHOUSE SOPs: the farm context lists, per greenhouse, the SOP assigned to its live cycle with today's HST (days after transplant), today's feed/water settings and job, the current stage's rules, and the next few days. When the user asks about a specific greenhouse or cycle, answer ONLY from THAT greenhouse's SOP block — never borrow numbers, stages or jobs from another greenhouse's SOP. If a greenhouse has no SOP listed, say so instead of guessing. Quote the SOP's exact EC/ppm/water/pulse figures.`;

export type ChatAttachment = { path: string; mimeType: string; name?: string };
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
};

const SUPPORTED_VISION_MEDIA: ReadonlySet<string> = new Set([
  "image/webp",
  "image/jpeg",
  "image/png",
  "image/gif",
]);

/** Document attachments are stored as extracted plain text (see
 *  uploadAiAttachment) — read them back and wrap so the model knows what it is. */
export function isTextAttachment(a: ChatAttachment): boolean {
  return a.mimeType === "text/plain" || a.mimeType.startsWith("text/");
}
export async function readTextAttachment(a: ChatAttachment): Promise<string> {
  const { buffer } = await readUpload(a.path);
  const body = buffer.toString("utf8");
  return `<attached_document name="${(a.name ?? a.path).replace(/"/g, "'")}">\n${body}\n</attached_document>`;
}

/**
 * Flatten a message to plain text: document attachments become inline text
 * blocks, images become a short marker. Used by text-only providers (the
 * OpenAI-compatible chain endpoints) so PDFs/Word docs still work there.
 */
export async function flattenMessageToText(m: ChatMessage): Promise<string> {
  if (!m.attachments?.length) return m.content;
  const parts: string[] = [];
  for (const a of m.attachments) {
    if (isTextAttachment(a)) parts.push(await readTextAttachment(a));
    else if (SUPPORTED_VISION_MEDIA.has(a.mimeType)) parts.push("[image attached — not visible to this provider]");
  }
  if (m.content) parts.push(m.content);
  return parts.join("\n\n");
}

/**
 * Per-greenhouse SOP block for the AI context: today's HST row, the current
 * stage's rules (compressed), and the next few days' jobs. Kept compact so it
 * fits every provider's context; the full booklet stays on the SOP page.
 */
async function buildSopContext(): Promise<string> {
  const { sopTodayCards } = await import("@/server/sop-today");
  const cards = await sopTodayCards().catch(() => []);
  if (!cards.length) return "";
  const rows = (await prisma.sopDay.findMany({
    where: { sopId: { in: [...new Set(cards.map((c) => c.sopId))] } },
    orderBy: { day: "asc" },
    select: { sopId: true, day: true, stage: true, ec: true, ppm: true, sopPerTank: true, waterMl: true, pulses: true, times: true, jobEn: true },
  })) as { sopId: string; day: number; stage: string | null; ec: number | null; ppm: number | null; sopPerTank: string | null; waterMl: number | null; pulses: string | null; times: string | null; jobEn: string | null }[];

  const out: string[] = ["Greenhouse SOPs (one block per greenhouse — do not mix them):"];
  for (const c of cards) {
    const days = rows.filter((r) => r.sopId === c.sopId);
    const today = days.find((d) => d.day === c.hst);
    const stage = today?.stage ?? null;
    const stageRows = stage ? days.filter((d) => d.stage === stage) : [];
    // Compress the stage into runs of identical settings: "HST 8–24: EC 2100 · 800 mL · 4 × 6m".
    const runs: string[] = [];
    for (const r of stageRows) {
      const sig = `EC ${r.ec ?? "—"} µS (${r.ppm ?? "—"} ppm) · ${r.waterMl ?? "—"} mL/polybag · ${r.pulses ?? "—"}${r.times ? ` @ ${r.times}` : ""}${r.sopPerTank ? ` · SOP ${r.sopPerTank}/tank` : ""}`;
      const last = runs[runs.length - 1];
      if (last && last.endsWith(`| ${sig}`)) {
        runs[runs.length - 1] = last.replace(/^HST (\d+)(?:–\d+)? \|/, `HST $1–${r.day} |`);
      } else runs.push(`HST ${r.day} | ${sig}`);
    }
    const jobsAhead = days.filter((d) => d.day > c.hst && d.day <= c.hst + 7 && d.jobEn).map((d) => `HST ${d.day}: ${d.jobEn}`);
    const jobsInStage = stageRows.filter((d) => d.jobEn).map((d) => `HST ${d.day}: ${d.jobEn}`);
    out.push(
      `## ${c.greenhouseName} — cycle "${c.harvestName}" — SOP "${c.sopTitleEn}" — HST 0 (transplant) = ${c.hst0}, TODAY = HST ${c.hst}${stage ? ` (${stage} stage)` : ""}`,
      today
        ? `Today: EC ${today.ec ?? "—"} µS (${today.ppm ?? "—"} ppm) · ${today.waterMl ?? "—"} mL/polybag · ${today.pulses ?? "—"}${today.times ? ` @ ${today.times}` : ""}${today.sopPerTank ? ` · SOP ${today.sopPerTank}/tank` : ""}${today.jobEn ? ` · JOB TODAY: ${today.jobEn}` : " · routine day, no special job"}`
        : `Today: no schedule row for HST ${c.hst} (before start or past the end of the schedule)`,
      stage ? `${stage} stage settings: ${runs.map((r) => r.replace(" | ", ": ")).join("; ")}` : "",
      jobsInStage.length ? `${stage} stage jobs: ${jobsInStage.join("; ")}` : "",
      jobsAhead.length ? `Next 7 days: ${jobsAhead.join("; ")}` : "Next 7 days: no special jobs scheduled",
    );
  }
  return out.filter((l) => l !== "").join(String.fromCharCode(10));
}

export async function buildFarmContext(): Promise<string> {
  const sopBlock = await buildSopContext();
  const [activeHarvests, lowItems, openTasks] = await Promise.all([
    prisma.harvest.findMany({
      where: { status: "LIVE" },
      select: { name: true, variety: true, startDate: true, greenhouse: { select: { name: true } } },
    }),
    prisma.item.findMany({
      // Explicit select — `include` would pull every item's photo_data
      // blob into EVERY Ask AI / Echo question. The context builder only
      // needs names + stock math.
      select: {
        name: true,
        unit: true,
        reorder: true,
        batches: { select: { qty: true, consumptions: { select: { qty: true } } } },
      },
    }),
    prisma.task.findMany({
      where: { status: { not: "COMPLETED" } },
      select: { title: true, dueDate: true, priority: true },
      take: 10,
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const lowStock = (lowItems as { name: string; unit: string; reorder: Decimal; batches: { qty: Decimal; consumptions: { qty: Decimal }[] }[] }[])
    .map((it) => {
      const remaining = it.batches.reduce((sum: Decimal, b) => {
        const consumed = b.consumptions.reduce((s: Decimal, c) => s.plus(c.qty), new Decimal(0));
        return sum.plus(new Decimal(b.qty).minus(consumed));
      }, new Decimal(0));
      return { name: it.name, remaining: remaining.toFixed(0), reorder: it.reorder.toFixed(0), unit: it.unit };
    })
    .filter((x) => Number(x.reorder) > 0 && Number(x.remaining) <= Number(x.reorder));

  return [
    `Active harvests (${activeHarvests.length}):`,
    ...activeHarvests.map((h: { name: string; variety: string | null; startDate: Date; greenhouse: { name: string } }) =>
      `- ${h.name} (${h.greenhouse.name}${h.variety ? `, ${h.variety}` : ""}, started ${h.startDate.toISOString().slice(0, 10)})`,
    ),
    "",
    `Items at or below reorder threshold (${lowStock.length}):`,
    ...lowStock.map((x) => `- ${x.name}: ${x.remaining}/${x.reorder} ${x.unit}`),
    "",
    `Open tasks (top ${openTasks.length}):`,
    ...openTasks.map((t: { title: string; dueDate: Date; priority: "LOW" | "MEDIUM" | "HIGH" }) =>
      `- [${t.priority}] ${t.title} — due ${t.dueDate.toISOString().slice(0, 10)}`,
    ),
    ...(sopBlock ? ["", sopBlock] : []),
  ].join("\n");
}

type AnthropicImageMedia = "image/webp" | "image/jpeg" | "image/png" | "image/gif";

async function buildMessageContent(m: ChatMessage): Promise<Anthropic.Messages.MessageParam> {
  // Plain text path — no attachments, no extra read calls.
  if (!m.attachments || m.attachments.length === 0) {
    return { role: m.role, content: m.content };
  }
  // Assistant messages never carry images. Strip silently for safety.
  if (m.role === "assistant") {
    return { role: "assistant", content: m.content };
  }
  const blocks: Anthropic.Messages.ContentBlockParam[] = [];
  for (const a of m.attachments) {
    if (isTextAttachment(a)) {
      blocks.push({ type: "text", text: await readTextAttachment(a) });
      continue;
    }
    if (!SUPPORTED_VISION_MEDIA.has(a.mimeType)) continue;
    const data = await readUploadAsBase64(a.path);
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: a.mimeType as AnthropicImageMedia,
        data,
      },
    });
  }
  if (m.content) blocks.push({ type: "text", text: m.content });
  // Anthropic requires content arrays to be non-empty.
  if (blocks.length === 0) blocks.push({ type: "text", text: " " });
  return { role: "user", content: blocks };
}

/**
 * "auto" = the ranked provider chain from Settings → AI keys (Nemotron / Gemini
 * / Anthropic…, tried top-down). "claude" / "gemini" = the env-key direct
 * paths, kept as explicit options.
 */
export type AiProvider = "auto" | "claude" | "gemini";

export async function availableProviders(): Promise<AiProvider[]> {
  const out: AiProvider[] = [];
  const { describeChain } = await import("@/server/ai-chain");
  const chain = await describeChain().catch(() => []);
  if (chain.length > 0) out.push("auto");
  if (process.env.ANTHROPIC_API_KEY) out.push("claude");
  if (process.env.GEMINI_API_KEY) out.push("gemini");
  return out;
}

export async function askAi(
  provider: AiProvider,
  messages: ChatMessage[],
): Promise<string> {
  const context = await buildFarmContext();
  if (provider === "gemini") {
    const { askGemini } = await import("@/server/gemini");
    return askGemini(messages, context);
  }
  if (provider === "auto") {
    // Images need a vision-capable provider; the chain's chat path is text.
    // If the conversation carries images and a direct vision key exists, use
    // it; otherwise the chain sees a text marker in place of the image.
    const hasImages = messages.some((m) => m.attachments?.some((a) => SUPPORTED_VISION_MEDIA.has(a.mimeType)));
    if (hasImages && process.env.ANTHROPIC_API_KEY) return askClaude(messages, context);
    if (hasImages && process.env.GEMINI_API_KEY) {
      const { askGemini } = await import("@/server/gemini");
      return askGemini(messages, context);
    }
    const { askChat } = await import("@/server/ai-chain");
    const flat = await Promise.all(
      messages.map(async (m) => ({ role: m.role, content: await flattenMessageToText(m) })),
    );
    return askChat({
      system: `${SYSTEM_PROMPT}\n\nCurrent farm state:\n${context}`,
      messages: flat,
      maxTokens: 1024,
    });
  }
  return askClaude(messages, context);
}

export async function askClaude(
  messages: ChatMessage[],
  precomputedContext?: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured. Set it in your .env to enable Ask AI.");
  }

  const client = new Anthropic({ apiKey });
  const context = precomputedContext ?? (await buildFarmContext());

  const anthropicMessages = await Promise.all(messages.map(buildMessageContent));

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: `Current farm state:\n${context}`, cache_control: { type: "ephemeral" } },
    ],
    messages: anthropicMessages,
  });

  const text = response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return text;
}
