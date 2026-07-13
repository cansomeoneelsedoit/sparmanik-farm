import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";

import { auth } from "@/auth";
import { getActiveOrgId } from "@/server/org";
import { prisma } from "@/server/prisma";
import { ReportToolbar } from "@/app/print/harvest/[harvestId]/report-toolbar";

export const dynamic = "force-dynamic";

/**
 * A single printable sticker for one plant tag: the QR code + its number
 * (label) + greenhouse name. Print on a label/sticker sheet, peel, and stick to
 * the stake. Sized ~60mm square so it fits common label stock; the browser's
 * print engine renders it (no PDF library). Lives outside the (app) layout so
 * it's a clean sheet.
 */
export default async function TagStickerPage({
  params,
  searchParams,
}: {
  params: Promise<{ tagId: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role === "PORTAL") redirect("/training");
  const activeOrgId = await getActiveOrgId();
  if (!activeOrgId) notFound();
  const { tagId } = await params;
  const { auto } = await searchParams;

  const tag = await prisma.plantTag.findFirst({
    where: { id: tagId },
    select: {
      code: true,
      label: true,
      organizationId: true,
      greenhouse: { select: { name: true } },
    },
  });
  if (!tag || tag.organizationId !== activeOrgId) notFound();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const svg = await QRCode.toString(`${proto}://${host}/t/${tag.code}`, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return (
    <div className="min-h-screen bg-white p-6 text-zinc-900">
      {/* eslint-disable-next-line react/no-unknown-property */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          @page { margin: 8mm; }
        }
        .sticker svg { width: 100%; height: auto; display: block; }
      `}</style>
      <div className="no-print mx-auto mb-5 max-w-[420px]">
        <ReportToolbar autoPrint={auto === "1"} />
      </div>

      {/* The sticker itself. */}
      <div
        className="sticker mx-auto flex flex-col items-center gap-2 rounded-lg border-2 border-zinc-300 p-4"
        style={{ width: "60mm", breakInside: "avoid" }}
      >
        <div className="w-full max-w-[42mm]" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="text-center leading-tight">
          <div className="text-lg font-bold tracking-wide">{tag.label}</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            {tag.greenhouse.name}
          </div>
        </div>
      </div>

      <p className="no-print mx-auto mt-6 max-w-[420px] text-center text-xs text-zinc-500">
        Print on a sticker/label sheet, peel, and stick to the stake. Scanning it opens this
        plant&apos;s page. Need the whole set on one sheet? Use &quot;Print QR sheet&quot; on the
        Plant tags page.
      </p>
    </div>
  );
}
