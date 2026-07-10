import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { getActiveOrgId } from "@/server/org";

export const runtime = "nodejs";

/**
 * Stream a training image (lesson teaching picture or question picture)
 * from its DB blob. `kind` is "lesson" | "question".
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
  if (kind !== "lesson" && kind !== "question") {
    return new Response("Not found", { status: 404 });
  }

  // $queryRaw bypasses the org-scoping extension, so filter explicitly.
  const rows = (kind === "lesson"
    ? await prisma.$queryRaw`
        SELECT image_data, image_mime
          FROM lessons
         WHERE id = ${id} AND organization_id = ${orgId}
         LIMIT 1
      `
    : await prisma.$queryRaw`
        SELECT image_data, image_mime
          FROM questions
         WHERE id = ${id} AND organization_id = ${orgId}
         LIMIT 1
      `) as Array<{
    image_data: Buffer | Uint8Array | null;
    image_mime: string | null;
  }>;

  const row = rows[0];
  if (!row?.image_data) return new Response("Not found", { status: 404 });

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
