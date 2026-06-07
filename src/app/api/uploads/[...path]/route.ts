import { auth } from "@/auth";
import { readUpload } from "@/server/uploads";

export const runtime = "nodejs";

/**
 * Stream a file from the local uploads dir. Auth-gated.
 *
 * Deliberately minimal — no DB writes, no orphan cleanup. Earlier
 * iterations tried to lazy-null DB references when a file 404'd, but
 * that hot-pathed Prisma + the org-scoping extension into every image
 * request, and a single page render with 20+ image tags would queue up
 * 20 transactions behind it. That made the whole site feel laggy.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { path: segments } = await params;
  const relative = segments.join("/");

  try {
    const { buffer, contentType } = await readUpload(relative);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        // Long browser-side cache — uploads are content-hashed (random
        // cuid filenames) so they're effectively immutable. If a file is
        // re-uploaded it gets a new path; this URL never serves stale
        // bytes.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
