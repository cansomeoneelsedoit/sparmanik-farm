import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { varietyStyle } from "@/app/(app)/tags/variety-colors";

export const dynamic = "force-dynamic";

/**
 * Greenhouse layout map — styled to match Boyd's printed layout diagram:
 * green title block, row letters in circles (J north → A south), coloured
 * variety dots on a faint grid, NORTH/SOUTH arrow, control/seedling rooms on
 * the right, and legend + statistics cards below. Rendered as a white "document"
 * regardless of app theme. Every dot is a plant — tap it to open its page.
 */

export default async function GreenhouseMapPage({
  params,
}: {
  params: Promise<{ greenhouseId: string }>;
}) {
  const { greenhouseId } = await params;

  const gh = await prisma.greenhouse.findFirst({
    where: { id: greenhouseId },
    select: { id: true, name: true, organization: { select: { name: true } } },
  });
  if (!gh) notFound();

  const tags = (await prisma.plantTag.findMany({
    where: { greenhouseId: gh.id, row: { not: null } },
    orderBy: [{ row: "asc" }, { col: "asc" }, { plantSlot: "asc" }],
    select: {
      id: true,
      code: true,
      label: true,
      row: true,
      col: true,
      plantSlot: true,
      produce: { select: { id: true, name: true } },
      records: { where: { endedAt: null }, take: 1, select: { id: true } },
    },
  })) as Array<{
    id: string;
    code: string;
    label: string;
    row: string | null;
    col: number | null;
    plantSlot: string | null;
    produce: { id: string; name: string } | null;
    records: { id: string }[];
  }>;

  if (tags.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-3xl">{gh.name} — layout</h1>
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No layout tags for this greenhouse yet.
          </CardContent>
        </Card>
      </div>
    );
  }

  const varietyOrder: string[] = [];
  for (const t of tags) {
    const n = t.produce?.name ?? "—";
    if (!varietyOrder.includes(n)) varietyOrder.push(n);
  }
  const styleFor = (name: string | undefined) => varietyStyle(name, varietyOrder);

  const rows = Array.from(new Set(tags.map((t) => t.row!))).sort();
  const cols = Array.from(new Set(tags.map((t) => t.col!))).sort((a, b) => a - b);
  const byKey = new Map<string, (typeof tags)[number]>();
  for (const t of tags) byKey.set(`${t.row}:${t.col}:${t.plantSlot}`, t);
  const rowsNorthFirst = [...rows].reverse();

  // Per-variety stats + row ranges for the legend.
  const varietyStats = varietyOrder.map((name) => {
    const mine = tags.filter((t) => (t.produce?.name ?? "—") === name);
    const myRows = Array.from(new Set(mine.map((t) => t.row!))).sort();
    const bags = new Set(mine.map((t) => `${t.row}:${t.col}`)).size;
    return {
      name,
      produceId: mine[0]?.produce?.id ?? null,
      rows: myRows,
      rowLabel:
        myRows.length > 1 ? `Rows ${myRows[0]} to ${myRows[myRows.length - 1]}` : `Row ${myRows[0]}`,
      bags,
      plants: mine.length,
      growing: mine.filter((t) => t.records.length > 0).length,
    };
  });

  const Dot = ({ t }: { t: (typeof tags)[number] | undefined }) => {
    if (!t) return <span style={{ width: 11, height: 11 }} />;
    const s = styleFor(t.produce?.name);
    const growing = t.records.length > 0;
    return (
      <Link
        href={`/t/${t.code}`}
        title={`${t.label} — ${t.produce?.name ?? ""}${growing ? " (growing)" : " (free)"}`}
        className="inline-block shrink-0 rounded-full transition-transform hover:scale-150"
        style={{
          width: 11,
          height: 11,
          border: `1.5px solid ${s.border}`,
          background: s.hollow ? (growing ? s.border : "#fff") : growing ? s.fill : "#fff",
        }}
      />
    );
  };

  return (
    <div className="space-y-4">
      {/* Screen-only toolbar (the document below is theme-independent). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/tags">← Tags</Link>
        </Button>
        <Button asChild size="sm">
          <Link href={`/print/tags/${gh.id}?auto=1`} target="_blank">
            <Printer className="h-4 w-4" /> Print tags
          </Link>
        </Button>
      </div>

      {/* The layout "document" — always white, like the printed diagram. */}
      <div className="overflow-x-auto rounded-lg border bg-white p-5 text-zinc-900 shadow-sm">
        {/* w-max: the document grows to the grid's natural width, so the dot
            rows can never spill past the grid border into the rooms panel. */}
        <div className="w-max min-w-full">
          {/* Title block */}
          <div className="text-center">
            <h1
              className="text-3xl font-extrabold tracking-wide"
              style={{ color: "#14532d", fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              🌿 {(gh.organization?.name ?? "SPARMANIK FARM").toUpperCase()} GREENHOUSE LAYOUT 🌿
            </h1>
            <div className="mt-0.5 text-lg font-bold" style={{ color: "#166534" }}>
              {gh.name.toUpperCase()} – MAIN PRODUCTION HOUSE
            </div>
            <div className="mt-0.5 text-sm font-semibold">ORIENTATION: NORTH ↑</div>
          </div>

          {/* Grid + side panels */}
          <div className="mt-4 flex gap-3">
            {/* NORTH/SOUTH arrow rail */}
            <div className="flex w-14 shrink-0 flex-col items-center justify-between py-8">
              <div className="text-xs font-bold">NORTH</div>
              <div className="relative flex-1">
                <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2" style={{ background: "#15803d" }} />
                <div
                  className="absolute -top-1 left-1/2 -translate-x-1/2"
                  style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderBottom: "8px solid #15803d" }}
                />
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2"
                  style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "8px solid #15803d" }}
                />
              </div>
              <div className="text-xs font-bold">SOUTH</div>
            </div>

            {/* The planting grid — intrinsic width so all 43 columns stay
                INSIDE the border; the rooms panel sits cleanly after it. */}
            <div className="shrink-0 border-2 border-zinc-800">
              {/* direction header */}
              <div className="flex items-center justify-between border-b border-zinc-300 px-2 py-1 text-[10px] font-bold">
                <span>EAST (START) ⟶</span>
                <span>NUMBERING DIRECTION: EAST → WEST</span>
                <span>WEST (END)</span>
              </div>
              {/* column numbers */}
              <div className="flex items-center gap-[5px] px-1.5 pt-1.5">
                <div className="w-7 shrink-0" />
                {cols.map((c) => (
                  <div key={c} className="w-[28px] shrink-0 text-center text-[8px] font-semibold text-zinc-600">
                    {String(c).padStart(2, "0")}
                  </div>
                ))}
              </div>
              {/* rows, J (north) at top */}
              <div
                className="px-1 pb-1"
                style={{
                  backgroundImage:
                    "linear-gradient(#e4e4e7 1px, transparent 1px), linear-gradient(90deg, #e4e4e7 1px, transparent 1px)",
                  backgroundSize: "33px 33px",
                }}
              >
                {rowsNorthFirst.map((r) => (
                  <div key={r} className="flex items-center gap-[5px] py-[9px]">
                    <div className="flex w-7 shrink-0 items-center justify-center">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-zinc-800 text-[10px] font-bold">
                        {r}
                      </span>
                    </div>
                    {cols.map((c) => (
                      <div key={c} className="flex w-[28px] shrink-0 items-center justify-center gap-[4px]">
                        <Dot t={byKey.get(`${r}:${c}:A`)} />
                        <Dot t={byKey.get(`${r}:${c}:B`)} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Rooms on the west end */}
            <div className="flex w-32 shrink-0 flex-col border-2 border-zinc-800">
              <div className="flex flex-1 flex-col items-center justify-center gap-1 border-b-2 border-zinc-800 p-2 text-center">
                <span className="text-lg">⊕</span>
                <span className="text-[10px] font-semibold leading-tight">RUANG
                  <br />KONTROL</span>
              </div>
              <div className="flex flex-1 items-center justify-center p-2 text-center">
                <span className="text-[10px] font-semibold leading-tight">RUANG
                  <br />SEEDLING</span>
              </div>
            </div>
          </div>

          {/* Legend + stats cards */}
          <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {/* Legenda varietas */}
            <div className="overflow-hidden rounded border border-zinc-300">
              <div className="px-3 py-1.5 text-sm font-bold text-white" style={{ background: "#14532d" }}>
                LEGENDA VARIETAS
              </div>
              <div className="space-y-2 p-3">
                {varietyStats.map((v) => {
                  const s = styleFor(v.name);
                  return (
                    <div key={v.name} className="flex items-start gap-2">
                      <span
                        className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded-full"
                        style={{ border: `2px solid ${s.border}`, background: s.hollow ? "#fff" : s.fill }}
                      />
                      <div className="min-w-0 text-xs leading-tight">
                        <div className="font-bold uppercase">{v.name}</div>
                        <div className="font-semibold" style={{ color: "#166534" }}>{v.rowLabel}</div>
                        <div className="text-zinc-600">
                          {v.bags} polybags · {v.plants} plants · {v.growing} growing
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Statistics */}
            <div className="overflow-hidden rounded border border-zinc-300">
              <div className="px-3 py-1.5 text-sm font-bold text-white" style={{ background: "#14532d" }}>
                GREENHOUSE STATISTICS
              </div>
              <table className="w-full p-1 text-xs">
                <tbody>
                  {[
                    ["Total Rows", String(rows.length)],
                    ["Polybags per Row", String(cols.length)],
                    ["Total Polybags", String(rows.length * cols.length)],
                    ["Plants per Polybag", "2"],
                    ["Total Plants", String(tags.length)],
                    ["Direction of Numbering", "East → West"],
                    ["Row Order", `${rows[0]} (South) to ${rows[rows.length - 1]} (North)`],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-b border-zinc-100 last:border-0">
                      <td className="px-3 py-1 text-zinc-600">{k}</td>
                      <td className="px-3 py-1 font-semibold">: {v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Identification system */}
            <div className="overflow-hidden rounded border border-zinc-300">
              <div className="px-3 py-1.5 text-sm font-bold text-white" style={{ background: "#14532d" }}>
                IDENTIFICATION SYSTEM
              </div>
              <div className="space-y-1.5 p-3 text-xs leading-snug text-zinc-700">
                <p>
                  Each plant is uniquely identified:{" "}
                  <span className="font-bold">Row + Bag – Plant</span>
                </p>
                <p className="font-mono font-bold">A001-001 … J048-002</p>
                <p>-001 = plant A, -002 = plant B in the same polybag.</p>
                <p className="rounded bg-emerald-50 p-1.5">
                  If one plant dies or has disease, replace only that plant — the other keeps its
                  identity and record.
                </p>
              </div>
            </div>

            {/* Catatan */}
            <div className="overflow-hidden rounded border border-zinc-300">
              <div className="px-3 py-1.5 text-sm font-bold text-white" style={{ background: "#14532d" }}>
                CATATAN
              </div>
              <ul className="list-disc space-y-1 p-3 pl-7 text-xs leading-snug text-zinc-700">
                <li>2 benih ditanam per polybag.</li>
                <li>Setiap tanaman diberi ID individual untuk pencatatan pertumbuhan, kesehatan, dan produksi.</li>
                <li>Klik titik pada peta untuk membuka halaman tanaman (foto, catatan, riwayat).</li>
                <li>Dot terisi = sedang tumbuh · dot kosong = stake bebas.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
