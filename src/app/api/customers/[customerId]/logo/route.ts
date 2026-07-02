import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { getActiveOrgId } from "@/server/org";

export const runtime = "nodejs";

/**
 * Stream a customer's brand logo from the DB blob — mirrors the item-photo
 * route (/api/items/[itemId]/photo) so logos travel with the row during
 * local→prod sync instead of living on the filesystem.
 *
 * Uses `$queryRaw`, NOT `prisma.customer.findFirst`: the Customer model is
 * org-scoped by the Prisma `$extends` extension, whose activeOrgId cookie
 * resolution is unreliable in an API-route context (gotcha #14). A logo
 * lookup keyed by a globally-unique cuid behind an authed session has no
 * security need for org scoping, and $queryRaw is never intercepted by the
 * extension — so it always finds the row.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  // Scope to the caller's active org (app review #62).
  const orgId = await getActiveOrgId();
  if (!orgId) return new Response("Not found", { status: 404 });

  const { customerId } = await params;

  const rows = (await prisma.$queryRaw`
    SELECT logo_data, logo_mime
      FROM customers
     WHERE id = ${customerId} AND organization_id = ${orgId}
     LIMIT 1
  `) as Array<{ logo_data: Buffer | Uint8Array | null; logo_mime: string | null }>;

  const customer = rows[0];
  if (!customer?.logo_data) return new Response("Not found", { status: 404 });

  const buf = Buffer.isBuffer(customer.logo_data)
    ? customer.logo_data
    : Buffer.from(customer.logo_data);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": customer.logo_mime || "image/webp",
      "Content-Length": String(buf.length),
      // Logos are mutable (replaceable via Edit), so a short private cache +
      // SWR keeps list pages snappy while a replaced logo still appears soon.
      "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
