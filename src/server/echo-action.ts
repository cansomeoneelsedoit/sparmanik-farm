"use server";

import { z } from "zod";

import { auth } from "@/auth";
import { askEcho as askEchoServer } from "@/server/echo";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const schema = z.object({ question: z.string().min(1).max(2000) });

export async function askEcho(
  input: unknown,
): Promise<ActionResult<{ reply: string }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Empty question" };
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  try {
    const reply = await askEchoServer(parsed.data.question);
    return { ok: true, data: { reply } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
