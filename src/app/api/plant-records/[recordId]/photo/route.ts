import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { getActiveOrgId } from "@/server/org";

export const runtime = "nodejs";

/**
 * Stream a plant record's photo from its DB blob (the plant-tag equivalent of
 * /api/items/[itemId]/photo). PlantRecord isn't org-scoped, so we join to its
 * plant_tag and filter by organization_id via $queryRaw — the org extension is
 * flaky in API routes (gotcha #14), and raw SQL sidesteps it while still
 * enforcing tenancy. Behind the normal session; PORTAL logins are blocked.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ recordId: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  if ((session.user as { role?: string }).role === "PORTAL") {
    return new Response("Forbidden", { status: 403 });
  }

  const orgId = await getActiveOrgId();
  if (!orgId) return new Response("Not found", { status: 404 });

  const { recordId } = await params;
  const rows = (await prisma.$queryRaw`
    SELECT pr.photo_data, pr.photo_mime
      FROM plant_records pr
      JOIN plant_tags pt ON pt.id = pr.tag_id
     WHERE pr.id = ${recordId} AND pt.organization_id = ${orgId}
     LIMIT 1
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
