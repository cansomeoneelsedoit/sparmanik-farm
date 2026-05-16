"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

function parseYoutubeId(url: string): string | null {
  const m1 = url.match(/youtu\.be\/([\w-]{11})/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]v=([\w-]{11})/);
  if (m2) return m2[1];
  return null;
}

const youtubeSchema = z.object({
  titleEn: z.string().min(1),
  titleId: z.string().min(1),
  category: z.string().optional().default(""),
  url: z.string().url(),
});

export async function addYoutubeVideo(input: unknown): Promise<ActionResult> {
  const parsed = youtubeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const ytId = parseYoutubeId(parsed.data.url);
  if (!ytId) return { ok: false, error: "Couldn't parse YouTube URL" };
  await prisma.video.create({
    data: {
      titleEn: parsed.data.titleEn,
      titleId: parsed.data.titleId,
      category: parsed.data.category || null,
      type: "YOUTUBE",
      url: parsed.data.url,
      thumbnailPath: `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`,
    },
  });
  revalidatePath("/videos");
  return { ok: true };
}

export async function updateYoutubeVideo(id: string, input: unknown): Promise<ActionResult> {
  const parsed = youtubeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const ytId = parseYoutubeId(parsed.data.url);
  await prisma.video.update({
    where: { id },
    data: {
      titleEn: parsed.data.titleEn,
      titleId: parsed.data.titleId,
      category: parsed.data.category || null,
      url: parsed.data.url,
      thumbnailPath: ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : null,
    },
  });
  revalidatePath("/videos");
  return { ok: true };
}

export async function deleteVideo(id: string): Promise<ActionResult> {
  await prisma.video.delete({ where: { id } });
  revalidatePath("/videos");
  return { ok: true };
}
