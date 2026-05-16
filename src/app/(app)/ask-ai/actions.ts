"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { askAi, type AiProvider, type ChatMessage, type ChatAttachment } from "@/server/ai";
import { saveImageUpload } from "@/server/uploads";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const attachmentSchema = z.object({
  path: z.string().min(1),
  mimeType: z.string().min(1),
  width: z.number().int().nonnegative().optional(),
  height: z.number().int().nonnegative().optional(),
});

const schema = z.object({
  conversationId: z.string().min(1),
  content: z.string().max(8000),
  attachments: z.array(attachmentSchema).max(4).optional(),
  provider: z.enum(["claude", "gemini"]).default("claude"),
});

export async function sendAiMessage(
  input: unknown,
): Promise<ActionResult<{ reply: string; provider: AiProvider; conversationId: string }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  if (!parsed.data.content.trim() && (!parsed.data.attachments || parsed.data.attachments.length === 0)) {
    return { ok: false, error: "Empty message" };
  }
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  // Make sure the conversation belongs to this user.
  const conv = await prisma.aiConversation.findFirst({
    where: { id: parsed.data.conversationId, userId: session.user.id },
  });
  if (!conv) return { ok: false, error: "Conversation not found" };

  try {
    await prisma.aiMessage.create({
      data: {
        userId: session.user.id,
        conversationId: conv.id,
        role: "USER",
        content: parsed.data.content,
        attachments: parsed.data.attachments && parsed.data.attachments.length > 0
          ? (parsed.data.attachments as unknown as object)
          : undefined,
      },
    });

    // First-message auto-title: pick the first ~50 chars of the user's text.
    if (!conv.title && parsed.data.content.trim()) {
      const title = parsed.data.content.trim().slice(0, 60).replace(/\s+/g, " ");
      await prisma.aiConversation.update({
        where: { id: conv.id },
        data: { title },
      });
    }

    const history = await prisma.aiMessage.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: "asc" },
      take: 30,
    });
    type Row = {
      role: "USER" | "ASSISTANT";
      content: string;
      attachments: unknown;
    };
    const chat: ChatMessage[] = (history as Row[]).map((m) => ({
      role: m.role === "USER" ? "user" : "assistant",
      content: m.content,
      attachments: Array.isArray(m.attachments)
        ? (m.attachments as ChatAttachment[])
        : undefined,
    }));

    const reply = await askAi(parsed.data.provider, chat);
    await prisma.aiMessage.create({
      data: {
        userId: session.user.id,
        conversationId: conv.id,
        role: "ASSISTANT",
        content: reply,
      },
    });
    // Bump updatedAt + remember provider so the sidebar sort + the toggle
    // restore work next time the user opens the conversation.
    await prisma.aiConversation.update({
      where: { id: conv.id },
      data: { updatedAt: new Date(), provider: parsed.data.provider },
    });

    revalidatePath("/ask-ai");
    return {
      ok: true,
      data: { reply, provider: parsed.data.provider, conversationId: conv.id },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed" };
  }
}

export async function createConversation(): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const conv = await prisma.aiConversation.create({
    data: { userId: session.user.id },
  });
  revalidatePath("/ask-ai");
  return { ok: true, data: { id: conv.id } };
}

export async function deleteConversation(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  // Only delete if the conversation actually belongs to the caller.
  const conv = await prisma.aiConversation.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!conv) return { ok: false, error: "Not found" };
  await prisma.aiConversation.delete({ where: { id: conv.id } });
  revalidatePath("/ask-ai");
  return { ok: true };
}

export async function uploadAiAttachment(
  formData: FormData,
): Promise<ActionResult<{ path: string; mimeType: string; width: number; height: number }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };
  if (!file.type.startsWith("image/")) return { ok: false, error: "Images only" };
  try {
    const saved = await saveImageUpload(file, "ai");
    return {
      ok: true,
      data: {
        path: saved.path,
        mimeType: "image/webp",
        width: saved.width,
        height: saved.height,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed" };
  }
}
