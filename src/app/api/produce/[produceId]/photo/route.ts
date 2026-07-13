import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { getActiveOrgId } from "@/server/org";

export const runtime = "nodejs";

/**
 * Stream a variety's reference photo from its DB blob (same pattern as
 * /api/items/[itemId]/photo). Org-scoped via $queryRaw + explicit
 * organization_id — the org extension is flaky in API routes (gotcha #14).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ produceId: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const orgId = await getActiveOrgId();
  if (!orgId) return new Response("Not found", { status: 404 });

  const { produceId } = await params;
  const rows = (await prisma.$queryRaw`
    SELECT photo_data, photo_mime FROM produce
     WHERE id = ${produceId} AND organization_id = ${orgId} LIMIT 1
  `) as Array<{ photo_data: Buffer | Uint8Array | null; photo_mime: string | null }>;

  const row = rows[0];
  if (!row?.photo_data) return new Response("Not found", { status: 404 });

  const buf = Buffer.isBuffer(row.photo_data) ? row.photo_data : Buffer.from(row.photo_data);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": row.photo_mime || "image/webp",
      "Content-Length": String(buf.length),
      "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
