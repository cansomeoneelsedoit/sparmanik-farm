"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { saveImageBuffer, saveImageUpload } from "@/server/uploads";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Save a custom video thumbnail to the uploads pipeline. Works for either
 * an arbitrary image the user picked from disk OR a Blob captured client-
 * side from the video element (canvas frame grab).
 *
 * The path returned is relative — store it on Video.thumbnailPath as-is and
 * render it via /api/uploads/<path> at view time.
 */
export async function uploadVideoThumbnail(
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const s = await auth();
  if (!s?.user?.id) return { ok: false, error: "Not signed in" };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };
  try {
    const saved =
      file.size > 0
        ? await saveImageUpload(file, "videos")
        : // saveImageBuffer covers the case where the client serialised a
          // canvas blob into a zero-length File wrapper around an ArrayBuffer
          await saveImageBuffer(Buffer.from(await file.arrayBuffer()), "videos");
    return { ok: true, data: { path: saved.path } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed" };
  }
}

function parseYoutubeId(url: string): string | null {
  const m1 = url.match(/[?&]v=([\w-]{11})/);
  if (m1) return m1[1];
  const m2 = url.match(/youtu\.be\/([\w-]{11})/);
  if (m2) return m2[1];
  const m3 = url.match(/youtube\.com\/shorts\/([\w-]{11})/);
  if (m3) return m3[1];
  const m4 = url.match(/youtube\.com\/embed\/([\w-]{11})/);
  if (m4) return m4[1];
  const m5 = url.match(/youtube\.com\/live\/([\w-]{11})/);
  if (m5) return m5[1];
  return null;
}

/**
 * Detects which platform a URL belongs to. Returns "OTHER" for anything
 * we can recognise as a URL but can't embed natively.
 */
export type VideoPlatform = "YOUTUBE" | "TIKTOK" | "INSTAGRAM" | "OTHER";
function detectPlatform(url: string): VideoPlatform {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "YOUTUBE";
  if (u.includes("tiktok.com")) return "TIKTOK";
  if (u.includes("instagram.com")) return "INSTAGRAM";
  return "OTHER";
}

const youtubeSchema = z.object({
  titleEn: z.string().min(1),
  titleId: z.string().min(1),
  category: z.string().optional().default(""),
  url: z.string().url(),
  // Relative upload path (e.g. "videos/abc.webp"). When set, overrides the
  // auto-fetched YouTube poster. Empty string / null = revert to YT auto.
  thumbnailPath: z.string().optional().nullable(),
});

function resolveThumbnail(ytId: string | null, customPath: string | null | undefined): string | null {
  if (customPath && customPath.trim() !== "") return customPath;
  return ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : null;
}

export async function addYoutubeVideo(input: unknown): Promise<ActionResult> {
  const parsed = youtubeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const platform = detectPlatform(parsed.data.url);
  if (platform === "OTHER") {
    return { ok: false, error: "URL doesn't look like YouTube, TikTok, or Instagram" };
  }
  const ytId = platform === "YOUTUBE" ? parseYoutubeId(parsed.data.url) : null;
  if (platform === "YOUTUBE" && !ytId) return { ok: false, error: "Couldn't parse YouTube URL" };
  await prisma.video.create({
    data: {
      titleEn: parsed.data.titleEn,
      titleId: parsed.data.titleId,
      category: parsed.data.category || null,
      // The Prisma enum only has YOUTUBE/UPLOAD today, so non-YouTube
      // platforms get stored as YOUTUBE and discriminated by URL host at
      // render time. Avoids a migration for an enum-only change.
      type: "YOUTUBE",
      url: parsed.data.url,
      thumbnailPath: resolveThumbnail(ytId, parsed.data.thumbnailPath),
    },
  });
  revalidatePath("/videos");
  return { ok: true };
}

export async function updateYoutubeVideo(id: string, input: unknown): Promise<ActionResult> {
  const parsed = youtubeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const platform = detectPlatform(parsed.data.url);
  const ytId = platform === "YOUTUBE" ? parseYoutubeId(parsed.data.url) : null;
  await prisma.video.update({
    where: { id },
    data: {
      titleEn: parsed.data.titleEn,
      titleId: parsed.data.titleId,
      category: parsed.data.category || null,
      url: parsed.data.url,
      thumbnailPath: resolveThumbnail(ytId, parsed.data.thumbnailPath),
    },
  });
  revalidatePath("/videos");
  return { ok: true };
}

/** Upload a video file to the local uploads area and register it as a
 * video. The actual file goes to uploads/video-files/<id>.<ext> rather
 * than through the sharp pipeline (which is image-only). */
const uploadedVideoSchema = z.object({
  titleEn: z.string().min(1),
  titleId: z.string().min(1),
  category: z.string().optional().default(""),
  path: z.string().min(1),
  thumbnailPath: z.string().optional().nullable(),
});

export async function addUploadedVideo(input: unknown): Promise<ActionResult> {
  const parsed = uploadedVideoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  await prisma.video.create({
    data: {
      titleEn: parsed.data.titleEn,
      titleId: parsed.data.titleId,
      category: parsed.data.category || null,
      type: "UPLOAD",
      path: parsed.data.path,
      thumbnailPath: parsed.data.thumbnailPath || null,
    },
  });
  revalidatePath("/videos");
  return { ok: true };
}

/** Stream-save a video file from a FormData blob. No sharp; just write to
 * disk under UPLOAD_DIR/video-files/. Returns the relative path. */
export async function uploadVideoFile(
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const s = await auth();
  if (!s?.user?.id) return { ok: false, error: "Not signed in" };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };
  const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB
  if (file.size > MAX_VIDEO_BYTES) {
    return { ok: false, error: "Video too large (max 200 MB)" };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs/promises");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require("node:crypto");
    const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
    const ext = (file.name.split(".").pop() ?? "mp4").toLowerCase().slice(0, 6);
    const id = crypto.randomBytes(16).toString("hex");
    const relative = path.join("video-files", `${id}.${ext}`);
    const absolute = path.join(UPLOAD_DIR, relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(absolute, buffer);
    return { ok: true, data: { path: relative.replace(/\\/g, "/") } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed" };
  }
}

export async function deleteVideo(id: string): Promise<ActionResult> {
  await prisma.video.delete({ where: { id } });
  revalidatePath("/videos");
  return { ok: true };
}
