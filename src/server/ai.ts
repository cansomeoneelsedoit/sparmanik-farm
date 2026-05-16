import Anthropic from "@anthropic-ai/sdk";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";

const SYSTEM_PROMPT = `You are the operations assistant for Sparmanik Farm, a hydroponic farm in Indonesia growing primarily melon, chili, and seasonal greens. You help the operator make decisions about inventory, harvests, tasks, staff scheduling, and nutrient recipes. Be concise (3-5 sentences unless detailed steps are requested), practical, and pragmatic. Use IDR (rupiah) for prices. When uncertain, ask for the missing detail rather than guessing.`;

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function buildFarmContext(): Promise<string> {
  const [activeHarvests, lowItems, openTasks] = await Promise.all([
    prisma.harvest.findMany({
      where: { status: "LIVE" },
      select: { name: true, variety: true, startDate: true, greenhouse: { select: { name: true } } },
    }),
    prisma.item.findMany({
      include: { batches: { select: { qty: true, consumptions: { select: { qty: true } } } } },
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
  ].join("\n");
}

export async function askClaude(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured. Set it in your .env to enable Ask AI.");
  }

  const client = new Anthropic({ apiKey });
  const context = await buildFarmContext();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: `Current farm state:\n${context}`, cache_control: { type: "ephemeral" } },
    ],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const text = response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return text;
}
