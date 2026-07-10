import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { getActiveOrgId } from "@/server/org";

export const runtime = "nodejs";

/**
 * Stream a training image (module teaching picture or question picture)
 * from its DB blob. `kind` is "module" | "question" — "lesson" is kept as
 * an alias for "module" so image URLs from before the modules refactor
 * keep working (the blobs live in the legacy "lessons" table either way).
 *
 * Mirrors /api/items/[itemId]/photo: `$queryRaw` instead of the org-scoped
 * `findFirst` because the Prisma org extension's cookie resolution is flaky
 * in API-route contexts (gotcha #14 — every image would intermittently 404).
 * The org filter is applied explicitly in the SQL instead, via
 * getActiveOrgId(), which reads auth + cookie directly and is reliable here.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const orgId = await getActiveOrgId();
  if (!orgId) return new Response("Not found", { status: 404 });

  const { kind, id } = await params;
  if (kind !== "module" && kind !== "lesson" && kind !== "question" && kind !== "course") {
    return new Response("Not found", { status: 404 });
  }

  // $queryRaw bypasses the org-scoping extension, so filter explicitly.
  const rows = (kind === "question"
    ? await prisma.$queryRaw`
        SELECT image_data, image_mime
          FROM questions
         WHERE id = ${id} AND organization_id = ${orgId}
         LIMIT 1
      `
    : kind === "course"
      ? await prisma.$queryRaw`
        SELECT image_data, image_mime
          FROM courses
         WHERE id = ${id} AND organization_id = ${orgId}
         LIMIT 1
      `
      : await prisma.$queryRaw`
        SELECT image_data, image_mime
          FROM lessons
         WHERE id = ${id} AND organization_id = ${orgId}
         LIMIT 1
      `) as Array<{
    image_data: Buffer | Uint8Array | null;
    image_mime: string | null;
  }>;

  const row = rows[0];
  if (!row?.image_data) return new Response("Not found", { status: 404 });

  // Entitlement gate for module/question teaching images (course cover images
  // are catalog thumbnails, deliberately visible pre-enrollment). A priced
  // course's teaching pictures should follow the same published + enrollment
  // rule as its modules. Superusers bypass. Module↔Course is many-to-many, so
  // one accessible containing course is enough.
  const role = (session.user as { role?: string }).role;
  if (role !== "SUPERUSER" && kind !== "course") {
    const userId = session.user.id;
    // For a question, resolve to its owning module first (lesson_id).
    const moduleFilter =
      kind === "question"
        ? prisma.$queryRaw`SELECT lesson_id AS module_id FROM questions WHERE id = ${id} AND organization_id = ${orgId} LIMIT 1`
        : null;
    const moduleId =
      kind === "question"
        ? ((await moduleFilter) as Array<{ module_id: string }>)[0]?.module_id
        : id;
    if (!moduleId) return new Response("Not found", { status: 404 });
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

  const buf = Buffer.isBuffer(row.image_data) ? row.image_data : Buffer.from(row.image_data);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": row.image_mime || "image/webp",
      "Content-Length": String(buf.length),
      // Builder images are mutable (replace/clear), so keep the cache short.
      "Cache-Control": "private, max-age=300",
    },
  });
}
