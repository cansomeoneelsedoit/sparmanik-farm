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

/**
 * Save an image we already have as a Buffer (e.g. an image extracted from an
 * .xlsx drawing). Pipeline matches saveImageUpload — sharp resize on the
 * longest side, WebP @ q82, random filename under UPLOAD_DIR/<subdir>/.
 */
export async function saveImageBuffer(
  buffer: Buffer,
  subdir = "misc",
): Promise<SavedImage> {
  if (buffer.length > MAX_BYTES) {
    throw new Error(`Image too large (max ${MAX_BYTES / 1024 / 1024} MB)`);
  }
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

const EXT_TO_MIME: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

/** Read an upload from disk for the /api/uploads/[...path] route. */
export async function readUpload(relativePath: string): Promise<{ buffer: Buffer; contentType: string }> {
  const safe = safeRelativePath(relativePath);
  const absolute = path.join(UPLOAD_DIR, safe);
  const buffer = await fs.readFile(absolute);
  const ext = path.extname(safe).toLowerCase();
  const contentType = EXT_TO_MIME[ext] ?? "application/octet-stream";
  return { buffer, contentType };
}

/**
 * Save a non-image file (PDF, Word, Excel) bit-for-bit. Skips the sharp
 * resize pipeline — for receipts we want to keep PDFs viewable in a
 * reader and Word/Excel parseable.
 *
 * Files this size are typical for receipts (< 5 MB). Anything bigger is
 * rejected so a misclicked video upload doesn't fill the disk.
 */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function saveFileUpload(
  file: File,
  subdir = "misc",
): Promise<SavedImage> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  // Preserve the extension where it's a known type, fall back to .bin.
  const origExt = path.extname(file.name).toLowerCase();
  const ext = EXT_TO_MIME[origExt] ? origExt : ".bin";
  const id = crypto.randomBytes(16).toString("hex");
  const relative = path.join(safeRelativePath(subdir), `${id}${ext}`);
  const absolute = path.join(UPLOAD_DIR, relative);
  await ensureDir(path.dirname(absolute));
  await fs.writeFile(absolute, buffer);
  return {
    path: relative.replace(/\\/g, "/"),
    bytes: buffer.length,
    width: 0,
    height: 0,
  };
}

export function getUploadDir(): string {
  return UPLOAD_DIR;
}

/**
 * Read an upload from disk and return it base64-encoded. Used for the
 * Anthropic vision API, which expects images embedded inline in the message
 * content as base64 strings.
 */
export async function readUploadAsBase64(relativePath: string): Promise<string> {
  const safe = safeRelativePath(relativePath);
  const absolute = path.join(UPLOAD_DIR, safe);
  const buffer = await fs.readFile(absolute);
  return buffer.toString("base64");
}
