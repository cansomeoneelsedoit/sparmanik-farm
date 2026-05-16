"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { askClaude, type ChatMessage } from "@/server/ai";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const schema = z.object({ content: z.string().min(1) });

export async function sendAiMessage(input: unknown): Promise<ActionResult<{ reply: string }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Empty message" };
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  try {
    await prisma.aiMessage.create({
      data: { userId: session.user.id, role: "USER", content: parsed.data.content },
    });

    const history = await prisma.aiMessage.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
      take: 30,
    });
    const chat: ChatMessage[] = (history as { role: "USER" | "ASSISTANT"; content: string }[]).map((m) => ({
      role: m.role === "USER" ? "user" : "assistant",
      content: m.content,
    }));

    const reply = await askClaude(chat);
    await prisma.aiMessage.create({
      data: { userId: session.user.id, role: "ASSISTANT", content: reply },
    });

    revalidatePath("/ask-ai");
    return { ok: true, data: { reply } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed" };
  }
}

export async function clearAiHistory(): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  await prisma.aiMessage.deleteMany({ where: { userId: session.user.id } });
  revalidatePath("/ask-ai");
  return { ok: true };
}
