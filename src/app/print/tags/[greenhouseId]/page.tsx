import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";

import { auth } from "@/auth";
import { getActiveOrgId } from "@/server/org";
import { prisma } from "@/server/prisma";
import { ReportToolbar } from "@/app/print/harvest/[harvestId]/report-toolbar";

export const dynamic = "force-dynamic";

/**
 * Printable A4 sheet of a greenhouse's QR plant tags. Print → cut → laminate →
 * stake. Each QR encodes an absolute /t/<code> URL (derived from the request
 * host so the same page works on localhost and Railway). Lives outside the
 * (app) layout so it's a clean sheet; browser print engine, no PDF library.
 */
export default async function TagSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ greenhouseId: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role === "PORTAL") redirect("/training");
  const activeOrgId = await getActiveOrgId();
  if (!activeOrgId) notFound();
  const { greenhouseId } = await params;
  const { auto } = await searchParams;

  const gh = await prisma.greenhouse.findFirst({
    where: { id: greenhouseId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      organization: { select: { name: true } },
      plantTags: { orderBy: { label: "asc" }, select: { id: true, code: true, label: true } },
    },
  });
  if (!gh || gh.organizationId !== activeOrgId) notFound();

  // Absolute scan URL — phones need the full host, not a relative path.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  const cells = await Promise.all(
    gh.plantTags.map(async (t: { id: string; code: string; label: string }) => ({
      ...t,
      svg: await QRCode.toString(`${proto}://${host}/t/${t.code}`, {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "M",
      }),
    })),
  );

  return (
    <div className="mx-auto max-w-[820px] bg-white p-6 text-zinc-900">
      {/* eslint-disable-next-line react/no-unknown-property */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
        .qr-cell svg { width: 100%; height: auto; }
      `}</style>
      <ReportToolbar autoPrint={auto === "1"} />

      <header className="mb-4 flex items-baseline justify-between border-b pb-2">
        <h1 className="text-lg font-semibold">
          {gh.organization?.name ?? "Farm"} — plant tags · {gh.name}
        </h1>
        <span className="text-xs text-zinc-500">{cells.length} tags</span>
      </header>

      {cells.length === 0 ? (
        <p className="text-sm text-zinc-500">No tags minted for this greenhouse yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {cells.map((t) => (
            <div
              key={t.id}
              className="qr-cell flex flex-col items-center gap-2 rounded border border-dashed border-zinc-300 p-4"
              style={{ breakInside: "avoid" }}
            >
              <div
                className="w-full max-w-[150px]"
                dangerouslySetInnerHTML={{ __html: t.svg }}
              />
              <div className="text-center">
                <div className="text-sm font-semibold">{t.label}</div>
                <div className="text-[10px] text-zinc-500">{gh.name}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="no-print mt-6 text-xs text-zinc-500">
        Print, cut along the dashed lines, laminate, and stake with the plants. Tags are
        recycled — when a crop finishes, re-stake the same tag with the next plant.
      </p>
    </div>
  );
}
