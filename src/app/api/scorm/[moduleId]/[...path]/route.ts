import { promises as fs } from "node:fs";
import path from "node:path";

import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { getActiveOrgId } from "@/server/org";
import { resolveScormFile } from "@/server/scorm";

export const runtime = "nodejs";

/**
 * Serve a file from a module's extracted SCORM package
 * (<UPLOAD_DIR>/scorm/<moduleId>/...). Auth-gated: signed-in users only, and
 * the module must belong to the caller's active org.
 *
 * Mirrors /api/training/image: `$queryRaw` with an explicit org filter
 * instead of the org-scoped `findFirst`, because the Prisma org extension's
 * cookie resolution is flaky in API-route contexts (gotcha #14) — SCOs load
 * dozens of assets per page, so an intermittent 404 here would break playback.
 *
 * Path safety lives in resolveScormFile (src/server/scorm.ts): "..",
 * absolute paths, and drive-letter segments are rejected before any disk I/O.
 */

const EXT_TO_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".xml": "application/xml",
  ".xsd": "application/xml",
  ".dtd": "application/xml-dtd",
  ".swf": "application/x-shockwave-flash",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".vtt": "text/vtt",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".pdf": "application/pdf",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ moduleId: string; path: string[] }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const orgId = await getActiveOrgId();
  if (!orgId) return new Response("Not found", { status: 404 });

  const { moduleId, path: segments } = await params;
  if (!/^[A-Za-z0-9_-]+$/.test(moduleId)) return new Response("Not found", { status: 404 });

  // $queryRaw bypasses the org-scoping extension, so filter explicitly.
  // (Module maps to the legacy "lessons" table.)
  const rows = (await prisma.$queryRaw`
    SELECT scorm_path
      FROM lessons
     WHERE id = ${moduleId} AND organization_id = ${orgId}
     LIMIT 1
  `) as Array<{ scorm_path: string | null }>;
  if (!rows[0]?.scorm_path) return new Response("Not found", { status: 404 });

  // Entitlement gate — the SCO IS the paid content, so serving its assets must
  // honour the same published + enrollment rule as the player page. Without
  // this a learner could replay a saved /api/scorm URL after their enrollment
  // is revoked, or reach an unpublished course's package. Superusers bypass.
  // Module↔Course is many-to-many, so a single accessible containing course
  // is enough. (Raw SQL again — the org extension doesn't run here.)
  const role = (session.user as { role?: string }).role;
  if (role !== "SUPERUSER") {
    const userId = session.user.id;
    const access = (await prisma.$queryRaw`
      SELECT 1
        FROM course_modules cm
        JOIN courses c ON c.id = cm.course_id
       WHERE cm.module_id = ${moduleId}
         AND c.organization_id = ${orgId}
         AND c.published = true
         AND (
           c.price_idr IS NULL
           OR c.price_idr = 0
           OR EXISTS (
             SELECT 1 FROM course_enrollments e
              WHERE e.course_id = c.id AND e.user_id = ${userId}
           )
         )
       LIMIT 1
    `) as Array<unknown>;
    if (access.length === 0) return new Response("Not found", { status: 404 });
  }

  let absolute: string;
  try {
    absolute = resolveScormFile(moduleId, segments.join("/"));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  try {
    const buffer = await fs.readFile(absolute);
    const ext = path.extname(absolute).toLowerCase();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": EXT_TO_MIME[ext] ?? "application/octet-stream",
        "Content-Length": String(buffer.length),
        // Package contents only change on re-upload; an hour of private
        // caching keeps multi-asset SCOs snappy without going stale forever.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
