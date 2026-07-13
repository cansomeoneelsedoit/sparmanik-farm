import QRCode from "qrcode";

import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { getActiveOrgId } from "@/server/org";

export const runtime = "nodejs";

/**
 * A plant tag's QR code as an SVG image — encodes the absolute /t/<code> URL so
 * it opens the plant page when scanned. Used by the "view QR" dialog and as the
 * sticker's image source.
 *
 * Org-scoped via $queryRaw + an explicit organization_id filter, NOT the
 * org-scoping Prisma extension: cookie resolution is flaky in API-route
 * contexts (gotcha #14), so the tag would intermittently 404. getActiveOrgId()
 * reads auth + cookie directly and is reliable here.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ tagId: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  // Education-portal logins never touch farm operations.
  if ((session.user as { role?: string }).role === "PORTAL") {
    return new Response("Forbidden", { status: 403 });
  }

  const orgId = await getActiveOrgId();
  if (!orgId) return new Response("Not found", { status: 404 });

  const { tagId } = await params;
  const rows = (await prisma.$queryRaw`
    SELECT code FROM plant_tags WHERE id = ${tagId} AND organization_id = ${orgId} LIMIT 1
  `) as Array<{ code: string }>;
  const tag = rows[0];
  if (!tag) return new Response("Not found", { status: 404 });

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const svg = await QRCode.toString(`${proto}://${host}/t/${tag.code}`, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      // Tag codes are immutable, but keep it private + short-lived.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
