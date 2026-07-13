import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Greenhouse layout map — the on-screen version of the printed layout diagram.
 * Rows run north (top) → south (bottom), columns east (left) → west (right).
 * Each polybag holds 2 plants (A/B); every plant is its own QR tag. Cells are
 * coloured by the row's variety; a filled chip = a plant is growing, an outline
 * = the stake is free. Tap a chip to open that plant.
 */

// Variety → colour, matching the printed legend. Falls back to a palette by
// order for any variety not in the known set.
const KNOWN: Record<string, { chip: string; ring: string; dot: string }> = {
  "Yellow Kirin Kevin": { chip: "bg-yellow-400 text-yellow-950", ring: "ring-yellow-400", dot: "bg-yellow-400" },
  "White Kirin Kevin": { chip: "bg-zinc-100 text-zinc-700 dark:bg-zinc-200", ring: "ring-zinc-300", dot: "bg-zinc-200 border border-zinc-400" },
  "Sparmanik Manis Candy": { chip: "bg-orange-400 text-orange-950", ring: "ring-orange-400", dot: "bg-orange-400" },
  "Yellow Kirin Australia F3": { chip: "bg-blue-500 text-white", ring: "ring-blue-500", dot: "bg-blue-500" },
};
const FALLBACK = [
  { chip: "bg-emerald-400 text-emerald-950", ring: "ring-emerald-400", dot: "bg-emerald-400" },
  { chip: "bg-rose-400 text-rose-950", ring: "ring-rose-400", dot: "bg-rose-400" },
  { chip: "bg-violet-400 text-violet-950", ring: "ring-violet-400", dot: "bg-violet-400" },
];

export default async function GreenhouseMapPage({
  params,
}: {
  params: Promise<{ greenhouseId: string }>;
}) {
  const { greenhouseId } = await params;

  const gh = await prisma.greenhouse.findFirst({
    where: { id: greenhouseId },
    select: { id: true, name: true },
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

  // Distinct varieties (in appearance order) → colour.
  const varietyOrder: string[] = [];
  for (const t of tags) {
    const n = t.produce?.name ?? "—";
    if (!varietyOrder.includes(n)) varietyOrder.push(n);
  }
  const colourFor = (name: string | undefined) => {
    if (name && KNOWN[name]) return KNOWN[name];
    const i = Math.max(0, varietyOrder.indexOf(name ?? "—"));
    return FALLBACK[i % FALLBACK.length];
  };

  // Index by row → col → slot.
  const rows = Array.from(new Set(tags.map((t) => t.row!))).sort();
  const cols = Array.from(new Set(tags.map((t) => t.col!))).sort((a, b) => a - b);
  const byKey = new Map<string, (typeof tags)[number]>();
  for (const t of tags) byKey.set(`${t.row}:${t.col}:${t.plantSlot}`, t);

  const rowsNorthFirst = [...rows].reverse(); // J (north) at top → A (south) at bottom
  const counts = varietyOrder.map((v) => ({
    name: v,
    n: tags.filter((t) => (t.produce?.name ?? "—") === v).length,
    growing: tags.filter((t) => (t.produce?.name ?? "—") === v && t.records.length > 0).length,
  }));

  const Chip = ({ t }: { t: (typeof tags)[number] | undefined }) => {
    if (!t) return <span className="inline-block h-4 w-4" />;
    const c = colourFor(t.produce?.name);
    const growing = t.records.length > 0;
    return (
      <Link
        href={`/t/${t.code}`}
        title={`${t.label} — ${t.produce?.name ?? ""}${growing ? " (growing)" : " (free)"}`}
        className={cn(
          "inline-flex h-4 w-4 items-center justify-center rounded-sm text-[7px] font-bold leading-none transition-transform hover:scale-125",
          growing ? c.chip : cn("bg-transparent ring-1", c.ring, "text-muted-foreground"),
        )}
      >
        {t.plantSlot}
      </Link>
    );
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">{gh.name}</h1>
          <p className="text-sm text-muted-foreground">
            Layout map · {rows.length} rows × {cols.length} bags × 2 plants = {tags.length} tags ·
            north ↑, east ←
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/tags">← Tags</Link>
          </Button>
          <Button asChild>
            <Link href={`/print/tags/${gh.id}?auto=1`} target="_blank">
              <Printer className="h-4 w-4" /> Print tags
            </Link>
          </Button>
        </div>
      </header>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {counts.map((c) => {
          const col = colourFor(c.name);
          return (
            <div key={c.name} className="flex items-center gap-1.5">
              <span className={cn("inline-block h-3 w-3 rounded-sm", col.dot)} />
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground">
                {c.growing}/{c.n} growing
              </span>
            </div>
          );
        })}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-3">
          <div className="inline-block min-w-max">
            {/* column header */}
            <div className="flex gap-1 pl-6">
              {cols.map((c) => (
                <div key={c} className="w-9 text-center text-[8px] text-muted-foreground">
                  {String(c).padStart(2, "0")}
                </div>
              ))}
            </div>
            {rowsNorthFirst.map((r) => (
              <div key={r} className="flex items-center gap-1 py-0.5">
                <div className="w-5 text-center text-xs font-semibold text-muted-foreground">{r}</div>
                {cols.map((c) => (
                  <div
                    key={c}
                    className="flex w-9 items-center justify-center gap-0.5 rounded border border-border/50 bg-muted/20 py-1"
                    title={`${r}${String(c).padStart(2, "0")}`}
                  >
                    <Chip t={byKey.get(`${r}:${c}:A`)} />
                    <Chip t={byKey.get(`${r}:${c}:B`)} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Each cell is a polybag (2 plants, A + B). A filled chip is a growing plant; an outline is a
        free stake. Tap a chip to open that plant, add its photo &amp; notes, or re-stake it.
      </p>
    </div>
  );
}
