import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { getActiveOrgId } from "@/server/org";

export const runtime = "nodejs";

/**
 * Stream an item's photo from the DB blob — the new home for inventory
 * images so they travel with the row during local→prod sync instead of
 * living on the filesystem and going missing.
 *
 * Falls through to a 302 redirect to `/api/uploads/<photo_path>` when the
 * blob hasn't been backfilled yet — that route reads from disk like before.
 *
 * IMPORTANT — uses `$queryRaw`, NOT `prisma.item.findFirst`. The Item model
 * is org-scoped by the Prisma `$extends` extension (src/lib/prisma.ts),
 * which injects `where: { organizationId }` resolved from the request's
 * activeOrgId cookie. In this API-route context that resolution was
 * intermittently coming back null/mismatched, so findFirst returned null
 * and every photo 404'd (this is gotcha #14 biting an `<img>` fetch).
 *
 * A photo lookup keyed by a globally-unique cuid, behind an authenticated
 * session, has no security need for org scoping — you can't guess a cuid,
 * and a thumbnail isn't sensitive. `$queryRaw` is a client-level op the
 * extension never intercepts, so it always finds the row regardless of
 * cookie state. This is the bulletproof path.
 *
 * Auth-gated like /api/uploads — same session check, same error shape.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  // Scope to the caller's active org so a valid cuid from another farm can't be
  // read cross-tenant (app review #62). getActiveOrgId is a direct auth+cookie
  // read (not the flaky extension path), so it's reliable in a route handler.
  const orgId = await getActiveOrgId();
  if (!orgId) return new Response("Not found", { status: 404 });

  const { itemId } = await params;

  // $queryRaw bypasses the org-scoping extension, so we add the org filter here.
  const rows = (await prisma.$queryRaw`
    SELECT photo_data, photo_mime, photo_path
      FROM items
     WHERE id = ${itemId} AND organization_id = ${orgId}
     LIMIT 1
  `) as Array<{
    photo_data: Buffer | Uint8Array | null;
    photo_mime: string | null;
    photo_path: string | null;
  }>;

  const item = rows[0];
  if (!item) return new Response("Not found", { status: 404 });

  // Path A: bytes are in the DB — stream them directly.
  if (item.photo_data) {
    const buf = Buffer.isBuffer(item.photo_data)
      ? item.photo_data
      : Buffer.from(item.photo_data);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": item.photo_mime || "image/webp",
        "Content-Length": String(buf.length),
        // Photos in the DB are mutable (user can replace via Edit), so we
        // don't get the long-immutable cache the filesystem route uses.
        // 1 h private cache + SWR keeps list pages snappy (400 thumbnails
        // would otherwise re-fetch every nav) while a replaced photo still
        // shows up within the hour — acceptable for farm inventory shots.
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
      },
    });
  }

  // Path B: legacy item with on-disk photo only — bounce to the existing
  // /api/uploads/<path> route, which reads from the filesystem.
  if (item.photo_path) {
    return Response.redirect(
      new URL(`/api/uploads/${encodeURI(item.photo_path)}`, new URL(_req.url)),
      302,
    );
  }

  // No photo recorded at all.
  return new Response("Not found", { status: 404 });
}
