import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { getActiveOrgId } from "@/server/org";

export const runtime = "nodejs";

/**
 * Stream a plant-journal entry's photo from its DB blob. PlantNote → record →
 * tag (org-scoped) — tenancy enforced in raw SQL like the record photo route.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  if ((session.user as { role?: string }).role === "PORTAL") {
    return new Response("Forbidden", { status: 403 });
  }
  const orgId = await getActiveOrgId();
  if (!orgId) return new Response("Not found", { status: 404 });

  const { noteId } = await params;
  const rows = (await prisma.$queryRaw`
    SELECT pn.photo_data, pn.photo_mime
      FROM plant_notes pn
      JOIN plant_records pr ON pr.id = pn.record_id
      JOIN plant_tags pt ON pt.id = pr.tag_id
     WHERE pn.id = ${noteId} AND pt.organization_id = ${orgId}
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
