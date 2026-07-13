import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";

import { auth } from "@/auth";
import { getActiveOrgId } from "@/server/org";
import { prisma } from "@/server/prisma";
import { ReportToolbar } from "@/app/print/harvest/[harvestId]/report-toolbar";

export const dynamic = "force-dynamic";

/**
 * Printable QR plant-tag labels, sized for the physical 5.5 × 15 cm stakes.
 * Each label FACE is 55 × 40 mm: 24 mm QR (top), a 0.5 mm divider, then the
 * plant ID in bold ~7.5 mm text. (The requested 30 mm face can't hold a 24 mm
 * QR + a 9 mm bold ID + margins, so the face is 40 mm — still well within the
 * 150 mm stake; shrink the QR if you truly need 30 mm.)
 *
 * Layout greenhouses print in grid order (row → bag → plant A/B). Add ?row=A to
 * print just one row (variety), which is far more practical than 960 at once.
 * Each QR encodes an absolute /t/<code> URL so it works on localhost and prod.
 */
export default async function TagSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ greenhouseId: string }>;
  searchParams: Promise<{ auto?: string; row?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role === "PORTAL") redirect("/training");
  const activeOrgId = await getActiveOrgId();
  if (!activeOrgId) notFound();
  const { greenhouseId } = await params;
  const { auto, row } = await searchParams;
  const rowFilter = row?.trim().toUpperCase() || null;

  const gh = await prisma.greenhouse.findFirst({
    where: { id: greenhouseId },
    select: { id: true, name: true, organizationId: true, organization: { select: { name: true } } },
  });
  if (!gh || gh.organizationId !== activeOrgId) notFound();

  const tags = (await prisma.plantTag.findMany({
    where: { greenhouseId: gh.id, ...(rowFilter ? { row: rowFilter } : {}) },
    orderBy: [{ row: "asc" }, { col: "asc" }, { plantSlot: "asc" }, { label: "asc" }],
    select: { id: true, code: true, label: true, row: true },
  })) as Array<{ id: string; code: string; label: string; row: string | null }>;

  const allRows = Array.from(
    new Set(
      (
        (await prisma.plantTag.findMany({
          where: { greenhouseId: gh.id, row: { not: null } },
          select: { row: true },
          distinct: ["row"],
        })) as { row: string | null }[]
      )
        .map((r) => r.row)
        .filter((r): r is string => !!r),
    ),
  ).sort();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  const cells = await Promise.all(
    tags.map(async (t) => ({
      ...t,
      svg: await QRCode.toString(`${proto}://${host}/t/${t.code}`, {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "M",
      }),
    })),
  );

  return (
    <div className="bg-white p-4 text-zinc-900">
      {/* eslint-disable-next-line react/no-unknown-property */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          @page { size: A4; margin: 8mm; }
        }
        .sheet { display: flex; flex-wrap: wrap; gap: 3mm; }
        .label {
          width: 55mm; height: 40mm; box-sizing: border-box;
          border: 0.3mm solid #bbb; border-radius: 1.5mm;
          display: flex; flex-direction: column; align-items: center;
          break-inside: avoid; page-break-inside: avoid;
        }
        .label .qr { width: 24mm; height: 24mm; margin-top: 2mm; }
        .label .qr svg { width: 100%; height: 100%; display: block; }
        .label .divider { width: 51mm; border-top: 0.5mm solid #000; margin-top: 2mm; }
        .label .pid {
          height: 9mm; display: flex; align-items: center; justify-content: center;
          font-family: 'Arial Black', 'Helvetica Neue', Helvetica, Arial, sans-serif;
          font-weight: 800; font-size: 7.5mm; line-height: 9mm; letter-spacing: 0.3mm;
        }
      `}</style>

      <ReportToolbar autoPrint={auto === "1"} />

      <header className="no-print mx-auto mb-3 max-w-[900px] border-b pb-2">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-semibold">
            {gh.organization?.name ?? "Farm"} — plant tags · {gh.name}
          </h1>
          <span className="text-xs text-zinc-500">
            {cells.length} labels{rowFilter ? ` · row ${rowFilter}` : ""} · 55 × 40 mm each
          </span>
        </div>
        {allRows.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-zinc-500">Print one row:</span>
            <Link
              href={`/print/tags/${gh.id}`}
              className={`rounded border px-2 py-0.5 ${!rowFilter ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"}`}
            >
              All
            </Link>
            {allRows.map((r) => (
              <Link
                key={r}
                href={`/print/tags/${gh.id}?row=${r}`}
                className={`rounded border px-2 py-0.5 ${rowFilter === r ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"}`}
              >
                {r}
              </Link>
            ))}
          </div>
        ) : null}
      </header>

      {cells.length === 0 ? (
        <p className="text-sm text-zinc-500">No tags to print.</p>
      ) : (
        <div className="sheet mx-auto max-w-[900px]">
          {cells.map((t) => (
            <div key={t.id} className="label">
              <div className="qr" dangerouslySetInnerHTML={{ __html: t.svg }} />
              <div className="divider" />
              <div className="pid">{t.label}</div>
            </div>
          ))}
        </div>
      )}

      <p className="no-print mx-auto mt-4 max-w-[900px] text-xs text-zinc-500">
        Each label is 55 × 40 mm (24 mm QR + bold ID) for the 5.5 × 15 cm stakes. Print on sticker
        stock, peel, and apply to the top of each stake. Print row-by-row (buttons above) so you
        stake a variety at a time.
      </p>
    </div>
  );
}
