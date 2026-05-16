"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { askClaude, type ChatMessage, type ChatAttachment } from "@/server/ai";
import { saveImageUpload } from "@/server/uploads";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const attachmentSchema = z.object({
  path: z.string().min(1),
  mimeType: z.string().min(1),
  width: z.number().int().nonnegative().optional(),
  height: z.number().int().nonnegative().optional(),
});

const schema = z.object({
  content: z.string().max(8000),
  attachments: z.array(attachmentSchema).max(4).optional(),
});

export async function sendAiMessage(
  input: unknown,
): Promise<ActionResult<{ reply: string }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  if (!parsed.data.content.trim() && (!parsed.data.attachments || parsed.data.attachments.length === 0)) {
    return { ok: false, error: "Empty message" };
  }
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  try {
    await prisma.aiMessage.create({
      data: {
        userId: session.user.id,
        role: "USER",
        content: parsed.data.content,
        attachments: parsed.data.attachments && parsed.data.attachments.length > 0
          ? (parsed.data.attachments as unknown as object)
          : undefined,
      },
    });

    const history = await prisma.aiMessage.findMany({
      where: { userId: session.user.id },
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
    // saveImageUpload always re-encodes to WebP — Anthropic accepts WebP for
    // vision, so we hard-code the mime type rather than echoing file.type.
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
