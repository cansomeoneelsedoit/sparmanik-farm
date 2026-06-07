"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { SUPPORTED_PROVIDERS, testProviderKey } from "@/server/ai-chain";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const providerSchema = z.enum(SUPPORTED_PROVIDERS as [string, ...string[]]);

const addSchema = z.object({
  provider: providerSchema,
  label: z.string().optional().default(""),
  apiKey: z.string().min(8, "Key looks too short — paste the full value"),
  model: z.string().optional().default(""),
  rank: z.number().int().min(1).max(9999).optional(),
});

export async function addAiKey(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  }
  // Default rank: bump to end of the list so newly added keys try last.
  const last = await prisma.aiProviderKey.aggregate({ _max: { rank: true } });
  const rank = parsed.data.rank ?? ((last._max.rank ?? 0) + 10);
  const created = await prisma.aiProviderKey.create({
    data: {
      provider: parsed.data.provider,
      label: parsed.data.label || null,
      apiKey: parsed.data.apiKey.trim(),
      model: parsed.data.model || null,
      rank,
      enabled: true,
      lastStatus: "untested",
    },
  });
  revalidatePath("/settings/ai-keys");
  return { ok: true, data: { id: created.id } };
}

const updateSchema = z.object({
  label: z.string().optional().default(""),
  /** Pass empty to keep the existing key (the UI sends "" when the user
   * leaves the masked field untouched). */
  apiKey: z.string().optional().default(""),
  model: z.string().optional().default(""),
  rank: z.number().int().min(1).max(9999).optional(),
  enabled: z.boolean().optional(),
});

export async function updateAiKey(id: string, input: unknown): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const data: Record<string, unknown> = {
    label: parsed.data.label || null,
    model: parsed.data.model || null,
  };
  if (parsed.data.rank !== undefined) data.rank = parsed.data.rank;
  if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;
  if (parsed.data.apiKey && parsed.data.apiKey.trim().length >= 8) {
    data.apiKey = parsed.data.apiKey.trim();
    data.lastStatus = "untested";
    data.lastError = null;
  }
  await prisma.aiProviderKey.update({ where: { id }, data });
  revalidatePath("/settings/ai-keys");
  return { ok: true };
}

export async function setAiKeyEnabled(
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  await prisma.aiProviderKey.update({ where: { id }, data: { enabled } });
  revalidatePath("/settings/ai-keys");
  return { ok: true };
}

export async function deleteAiKey(id: string): Promise<ActionResult> {
  await prisma.aiProviderKey.delete({ where: { id } });
  revalidatePath("/settings/ai-keys");
  return { ok: true };
}

export async function reorderAiKey(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  // Re-order by swapping rank with the immediate neighbour. Keeps gaps in
  // the rank sequence so manual inserts (e.g. via addAiKey({ rank }))
  // still work without re-numbering every row.
  const all = (await prisma.aiProviderKey.findMany({
    orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
    select: { id: true, rank: true },
  })) as { id: string; rank: number }[];
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return { ok: false, error: "Not found" };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) return { ok: true };
  const here = all[idx];
  const there = all[swapIdx];
  await prisma.$transaction([
    prisma.aiProviderKey.update({ where: { id: here.id }, data: { rank: there.rank } }),
    prisma.aiProviderKey.update({ where: { id: there.id }, data: { rank: here.rank } }),
  ]);
  revalidatePath("/settings/ai-keys");
  return { ok: true };
}

export async function testAiKey(id: string): Promise<ActionResult<{ text: string }>> {
  const row = (await prisma.aiProviderKey.findFirst({
    where: { id },
    select: { id: true, provider: true, apiKey: true, model: true },
  })) as { id: string; provider: string; apiKey: string; model: string | null } | null;
  if (!row) return { ok: false, error: "Key not found" };
  const r = await testProviderKey({
    provider: row.provider,
    apiKey: row.apiKey,
    model: row.model || undefined,
  });
  if (r.ok) {
    await prisma.aiProviderKey.update({
      where: { id },
      data: { lastStatus: "ok", lastUsedAt: new Date(), lastError: null },
    });
    revalidatePath("/settings/ai-keys");
    return { ok: true, data: { text: r.text } };
  }
  await prisma.aiProviderKey.update({
    where: { id },
    data: {
      lastStatus: r.error.toLowerCase().includes("quota") ? "quota" : "error",
      lastUsedAt: new Date(),
      lastError: r.error.slice(0, 240),
    },
  });
  revalidatePath("/settings/ai-keys");
  return { ok: false, error: r.error };
}
