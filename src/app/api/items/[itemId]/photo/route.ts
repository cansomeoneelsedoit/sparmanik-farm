import { auth } from "@/auth";
import { prisma } from "@/server/prisma";

export const runtime = "nodejs";

/**
 * Stream an item's photo from the DB blob — the new home for inventory
 * images so they travel with the row during local→prod sync instead of
 * living on the filesystem and going missing.
 *
 * Falls through to a 302 redirect to `/api/uploads/<photo_path>` when the
 * blob hasn't been backfilled yet — that route reads from disk like before.
 * Once the backfill script + a few create/updates have run, every item ends
 * up with `photo_data` set and the redirect path is never taken.
 *
 * Auth-gated like /api/uploads — same session check, same error shape.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { itemId } = await params;
  const item = await prisma.item.findFirst({
    where: { id: itemId },
    select: { photoData: true, photoMime: true, photoPath: true },
  });
  if (!item) return new Response("Not found", { status: 404 });

  // Path A: bytes are in the DB — stream them directly.
  if (item.photoData) {
    const buf = Buffer.isBuffer(item.photoData)
      ? item.photoData
      : Buffer.from(item.photoData as Uint8Array);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": item.photoMime || "image/webp",
        "Content-Length": String(buf.length),
        // Photos in the DB are mutable (user can replace via Edit), so we
        // don't get to use the long-immutable cache the filesystem route
        // does. Short-lived private cache is enough — saves a re-fetch
        // for the next page nav but always refreshes after a few min.
        "Cache-Control": "private, max-age=300, must-revalidate",
      },
    });
  }

  // Path B: legacy item with on-disk photo only — bounce to the existing
  // /api/uploads/<path> route. After the user next edits this item, the
  // bytes get backfilled into the DB and Path A starts handling it.
  if (item.photoPath) {
    return Response.redirect(
      new URL(
        `/api/uploads/${encodeURI(item.photoPath)}`,
        new URL(_req.url),
      ),
      302,
    );
  }

  // No photo recorded at all.
  return new Response("Not found", { status: 404 });
}
