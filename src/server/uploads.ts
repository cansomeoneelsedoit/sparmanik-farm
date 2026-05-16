import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import sharp from "sharp";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DIMENSION = 2000;

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function safeRelativePath(p: string): string {
  // Reject ".." and absolute paths.
  if (p.includes("..")) throw new Error("invalid path");
  const norm = path.normalize(p).replace(/^[/\\]+/, "");
  return norm;
}

export type SavedImage = {
  /** Path relative to the upload root (and to the served /api/uploads/* URL). */
  path: string;
  bytes: number;
  width: number;
  height: number;
};

/**
 * Saves an image File from a Server Action. Resizes to MAX_DIMENSION on the
 * longest side and re-encodes as WebP. Returns a path that can be stored on
 * an entity and served via /api/uploads/[...path].
 */
export async function saveImageUpload(file: File, subdir = "misc"): Promise<SavedImage> {
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large (max ${MAX_BYTES / 1024 / 1024} MB)`);
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  const resized = await sharp(buffer)
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const meta = await sharp(resized).metadata();
  const id = crypto.randomBytes(16).toString("hex");
  const relative = path.join(safeRelativePath(subdir), `${id}.webp`);
  const absolute = path.join(UPLOAD_DIR, relative);
  await ensureDir(path.dirname(absolute));
  await fs.writeFile(absolute, resized);
  return {
    path: relative.replace(/\\/g, "/"),
    bytes: resized.length,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}

/** Read an upload from disk for the /api/uploads/[...path] route. */
export async function readUpload(relativePath: string): Promise<{ buffer: Buffer; contentType: string }> {
  const safe = safeRelativePath(relativePath);
  const absolute = path.join(UPLOAD_DIR, safe);
  const buffer = await fs.readFile(absolute);
  const ext = path.extname(safe).toLowerCase();
  const contentType =
    ext === ".webp"
      ? "image/webp"
      : ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : "application/octet-stream";
  return { buffer, contentType };
}

export function getUploadDir(): string {
  return UPLOAD_DIR;
}
