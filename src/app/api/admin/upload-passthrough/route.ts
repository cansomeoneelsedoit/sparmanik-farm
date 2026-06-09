import { promises as fs } from "node:fs";
import path from "node:path";

import { getUploadDir } from "@/server/uploads";

export const runtime = "nodejs";

/**
 * Admin-only endpoint used by `scripts/sync-local-to-prod.mjs` to push
 * uploaded files (item photos, staff portraits, receipt scans, etc.) from
 * the user's laptop to Railway's Volume.
 *
 * Auth: requires `Authorization: Bearer <SYNC_ADMIN_SECRET>` header. The
 * secret is set as a Railway env var (one-time setup by the user). When
 * SYNC_ADMIN_SECRET is unset on the server, this endpoint refuses all
 * requests — safer than falling open.
 *
 * Body: multipart/form-data with two parts:
 *   - relativePath: e.g. "items/abc123.webp"
 *   - file: the binary file content
 *
 * Path safety: `safeRelativePath` rejects anything containing `..` or
 * absolute paths, so the worst case is "wrote into UPLOAD_DIR/<garbage>"
 * — no breakout possible.
 *
 * Why this design (vs. SSH / rsync): Railway doesn't expose a direct
 * shell on web service containers by default, and asking the user to
 * configure SSH every time they want to sync is more friction than this.
 * One HTTP endpoint + one env var = setup once, sync forever.
 */
export async function POST(req: Request) {
  // --- Auth ---
  const expected = process.env.SYNC_ADMIN_SECRET;
  if (!expected || expected.length < 8) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          "SYNC_ADMIN_SECRET is not configured on this server. Set it as a Railway env var (must be ≥ 8 chars) and redeploy.",
      }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Constant-time compare guard against timing oracles. JS doesn't have a
  // built-in for this on strings — convert to Buffers and use the crypto
  // primitive.
  const okLen = provided.length === expected.length;
  let mismatch = okLen ? 0 : 1;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= (provided.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  }
  if (mismatch !== 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "Bad bearer token" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  // --- Parse multipart body ---
  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : "Bad multipart body",
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const relRaw = form.get("relativePath");
  const file = form.get("file");
  if (typeof relRaw !== "string" || !relRaw.trim()) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing relativePath" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  if (!(file instanceof Blob)) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing file" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  // --- Path-safety + write ---
  let safe: string;
  try {
    safe = safeRelativePath(relRaw);
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : "Bad path",
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const root = getUploadDir();
  const absolute = path.join(root, safe);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(absolute, buf);

  return new Response(
    JSON.stringify({
      ok: true,
      data: { path: safe, bytes: buf.length },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/**
 * Same logic as the safe-path guard in src/server/uploads.ts but inlined
 * so this endpoint doesn't have to import the whole sharp pipeline.
 */
function safeRelativePath(p: string): string {
  if (p.includes("..")) throw new Error("Path contains '..'");
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) {
    throw new Error("Path must be relative");
  }
  // Normalise and strip any leading slashes Windows hands us via the dump.
  const norm = path.posix.normalize(p.replace(/\\/g, "/"));
  if (norm.startsWith("/")) return norm.slice(1);
  return norm;
}
