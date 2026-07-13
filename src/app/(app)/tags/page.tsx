import Link from "next/link";
import { Map as MapIcon, Printer, QrCode } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { varietyStyle } from "@/app/(app)/tags/variety-colors";
import { FindTag } from "@/app/(app)/tags/find-tag";
import {
  AssignPlantDialog,
  CreateTagsDialog,
  DeleteTagButton,
  EndAllocationButton,
  PlantNotesPhotoDialog,
  ShowQrDialog,
} from "@/app/(app)/tags/tag-dialogs";

export const dynamic = "force-dynamic";

/**
 * Plant tags — recyclable QR stakes. Each tag belongs to ONE greenhouse for
 * life; crop after crop it's re-staked with the current plant (a PlantRecord
 * per stay), so scanning the QR in the greenhouse always shows what's growing
 * there now, plus the stake's full history.
 */
export default async function TagsPage({
  searchParams,
}: {
  searchParams: Promise<{ gh?: string }>;
}) {
  const { gh } = await searchParams;

  const greenhouses = (await prisma.greenhouse.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { plantTags: true } } },
  })) as { id: string; name: string; _count: { plantTags: number } }[];

  const active = greenhouses.find((g) => g.id === gh) ?? greenhouses[0] ?? null;

  // Laid-out greenhouses carry hundreds of tags — decide up front so we can
  // skip loading every tag's full crop history (the overview only needs the
  // OPEN record, if any). Keeps this page fast at 860 tags.
  const isLaidOut = active
    ? (await prisma.plantTag.findFirst({
        where: { greenhouseId: active.id, row: { not: null } },
        select: { id: true },
      })) !== null
    : false;

  const recordSelect = {
    id: true,
    plantedAt: true,
    endedAt: true,
    seed: true,
    method: true,
    notes: true,
    photoMime: true,
    produceId: true,
    produce: { select: { name: true } },
  } as const;

  const [tags, produces] = active
    ? await Promise.all([
        prisma.plantTag.findMany({
          where: { greenhouseId: active.id },
          orderBy: { label: "asc" },
          select: {
            id: true,
            code: true,
            label: true,
            row: true,
            col: true,
            produce: { select: { id: true, name: true, photoMime: true } },
            records: isLaidOut
              ? { where: { endedAt: null }, take: 1, select: recordSelect }
              : { orderBy: { createdAt: "desc" as const }, select: recordSelect },
          },
        }),
        prisma.produce.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ])
    : [[], []];

  type TagRow = (typeof tags)[number];
  const produceOptions = (produces as { id: string; name: string }[]).map((p) => ({
    id: p.id,
    name: p.name,
  }));

  // A sensible default label prefix from the greenhouse name ("Greenhouse 1"
  // → "GREENHOUSE1" is ugly; take initials + digits, e.g. "GH1").
  const defaultPrefix = active
    ? (active.name.match(/\d+/)?.[0]
        ? `GH${active.name.match(/\d+/)?.[0]}`
        : active.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase()) || "TAG"
    : "TAG";

  const nowMs = new Date().getTime();
  const daysSince = (d: Date) =>
    Math.max(0, Math.floor((nowMs - new Date(d).getTime()) / 86_400_000));

  // A "laid out" greenhouse (tags carry a grid row) gets a visual overview
  // instead of hundreds of cards.
  type LaidTag = TagRow & {
    row: string | null;
    col: number | null;
    produce: { id: string; name: string; photoMime: string | null } | null;
    records: { endedAt: Date | null }[];
  };
  const laidTags = tags as LaidTag[];
  const varietyStats = (() => {
    const m = new Map<
      string,
      {
        name: string;
        produceId: string | null;
        photoMime: string | null;
        rows: Set<string>;
        bags: Set<string>;
        total: number;
        growing: number;
      }
    >();
    for (const t of laidTags) {
      const name = t.produce?.name ?? "Unassigned";
      const e =
        m.get(name) ??
        {
          name,
          produceId: t.produce?.id ?? null,
          photoMime: t.produce?.photoMime ?? null,
          rows: new Set<string>(),
          bags: new Set<string>(),
          total: 0,
          growing: 0,
        };
      if (t.row) e.rows.add(t.row);
      if (t.row && t.col != null) e.bags.add(`${t.row}:${t.col}`);
      e.total += 1;
      if (t.records.some((r: { endedAt: Date | null }) => r.endedAt === null)) e.growing += 1;
      m.set(name, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  })();
  const varietyOrder = varietyStats.map((v) => v.name);
  const totalPlants = laidTags.length;
  const totalGrowing = varietyStats.reduce((s, v) => s + v.growing, 0);
  const layoutRows = new Set(laidTags.filter((t) => t.row).map((t) => t.row)).size;
  const layoutCols = new Set(laidTags.filter((t) => t.col != null).map((t) => t.col)).size;
  const rowRange = (rows: Set<string>) => {
    const sorted = [...rows].sort();
    if (sorted.length === 0) return "";
    return sorted.length > 1 ? `Rows ${sorted[0]}–${sorted[sorted.length - 1]}` : `Row ${sorted[0]}`;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Plant tags</h1>
          <p className="text-sm text-muted-foreground">
            QR stakes that live in a greenhouse and get recycled crop after crop. Scan one in
            the greenhouse to see what&apos;s growing there.
          </p>
        </div>
        {active ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href={`/print/tags/${active.id}?auto=1`} target="_blank">
                <Printer className="h-4 w-4" /> Print QR sheet
              </Link>
            </Button>
            <CreateTagsDialog key={active.id} greenhouseId={active.id} defaultPrefix={defaultPrefix} />
          </div>
        ) : null}
      </header>

      {/* Greenhouse picker */}
      <div className="flex flex-wrap gap-2">
        {greenhouses.map((g) => (
          <Link
            key={g.id}
            href={`/tags?gh=${g.id}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              active?.id === g.id
                ? "border-accent bg-accent/15 font-medium text-accent"
                : "hover:bg-muted/50",
            )}
          >
            {g.name}
            <span className="ml-1.5 text-xs text-muted-foreground">{g._count.plantTags}</span>
          </Link>
        ))}
      </div>

      {!active ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Add a greenhouse first (Settings → Greenhouses), then mint tags for it.
          </CardContent>
        </Card>
      ) : (tags as TagRow[]).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            <QrCode className="mx-auto mb-2 h-8 w-8 opacity-40" />
            No tags in {active.name} yet — hit &quot;Add tags&quot; to mint a batch, then print
            and stake them.
          </CardContent>
        </Card>
      ) : isLaidOut ? (
        <div className="space-y-4">
          {/* Hero: headline stats + the two things you actually do here. */}
          <Card className="overflow-hidden">
            <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg,#f7d514 50%,#e02424 50% 70%,#f97316 70% 90%,#2563eb 90%)" }} />
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-lg font-semibold">{active.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {layoutRows} rows × {layoutCols} polybags × 2 plants
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button asChild className="h-10">
                    <Link href={`/tags/map/${active.id}`}>
                      <MapIcon className="h-4 w-4" /> Open layout map
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Stat strip */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <div className="text-2xl font-bold leading-none sm:text-3xl">{totalPlants}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">Plants</div>
                </div>
                <div className="rounded-lg border bg-emerald-50 p-3 text-center dark:bg-emerald-950/40">
                  <div className="text-2xl font-bold leading-none text-emerald-700 dark:text-emerald-400 sm:text-3xl">
                    {totalGrowing}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">Growing</div>
                </div>
                <div className="rounded-lg border bg-amber-50 p-3 text-center dark:bg-amber-950/40">
                  <div className="text-2xl font-bold leading-none text-amber-700 dark:text-amber-400 sm:text-3xl">
                    {totalPlants - totalGrowing}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">Free stakes</div>
                </div>
              </div>

              {/* Overall fill bar */}
              <div>
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Greenhouse planted</span>
                  <span>{totalPlants > 0 ? Math.round((totalGrowing / totalPlants) * 100) : 0}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${totalPlants > 0 ? (totalGrowing / totalPlants) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <FindTag greenhouseId={active.id} />
            </CardContent>
          </Card>

          {/* Variety cards — photo, colour, rows, counts. */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {varietyStats.map((v) => {
              const s = varietyStyle(v.name, varietyOrder);
              const pct = v.total > 0 ? Math.round((v.growing / v.total) * 100) : 0;
              return (
                <Card key={v.name} className="overflow-hidden">
                  <div className="h-1.5 w-full" style={{ background: s.hollow ? s.border : s.fill }} />
                  {v.produceId && v.photoMime ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/produce/${v.produceId}/photo`}
                      alt={v.name}
                      className="h-36 w-full border-b object-cover"
                    />
                  ) : (
                    <div className="flex h-36 w-full items-center justify-center border-b bg-muted/30">
                      <span
                        className="inline-block h-10 w-10 rounded-full"
                        style={{ border: `3px solid ${s.border}`, background: s.hollow ? "transparent" : s.fill }}
                      />
                    </div>
                  )}
                  <CardContent className="space-y-2 p-3">
                    <div>
                      <div className="truncate font-semibold" title={v.name}>{v.name}</div>
                      <div className="text-xs font-medium" style={{ color: "#166534" }}>
                        {rowRange(v.rows)}
                      </div>
                    </div>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-muted-foreground">{v.bags.size} polybags</span>
                      <span className="font-semibold">{v.total} plants</span>
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                        <span>{v.growing} growing</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: s.hollow ? s.border : s.fill }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {active.name} — {(tags as TagRow[]).length} tags
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(tags as TagRow[]).map((tag) => {
              type RecordRow = {
                id: string;
                plantedAt: Date;
                endedAt: Date | null;
                seed: string | null;
                method: string | null;
                notes: string | null;
                photoMime: string | null;
                produceId: string | null;
                produce: { name: string } | null;
              };
              const records = tag.records as RecordRow[];
              const current = records.find((r) => r.endedAt === null) ?? null;
              const past = records.filter((r) => r.endedAt !== null).length;
              return (
                <div key={tag.id} className="rounded-lg border transition-colors hover:border-accent/60">
                  {/* The whole top of the card opens the plant page — same page
                      the QR scan lands on — so you don't need to scan to browse. */}
                  <Link href={`/t/${tag.code}`} className="block p-3 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-medium hover:underline">{tag.label}</span>
                        <div className="text-[11px] text-muted-foreground">
                          {past > 0 ? `${past} past ${past === 1 ? "crop" : "crops"}` : "no history yet"}
                        </div>
                      </div>
                      {current ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300">
                          Growing
                        </Badge>
                      ) : (
                        <Badge variant="outline">Free</Badge>
                      )}
                    </div>
                    {current ? (
                      <div className="mt-2 text-sm">
                        <div className="font-medium">{current.produce?.name ?? "Unnamed plant"}</div>
                        <div className="text-xs text-muted-foreground">
                          Planted {new Date(current.plantedAt).toISOString().slice(0, 10)} —{" "}
                          {daysSince(current.plantedAt)} days ago
                          {current.seed ? ` · ${current.seed}` : ""}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Waiting for the next planting.
                      </p>
                    )}
                    <span className="mt-2 inline-block text-xs font-medium text-accent">
                      Open plant page →
                    </span>
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-2">
                    <ShowQrDialog
                      tagId={tag.id}
                      tagLabel={tag.label}
                      code={tag.code}
                      greenhouseName={active.name}
                    />
                    <AssignPlantDialog
                      // Remount on every allocation change so the form never
                      // shows the previous crop's values.
                      key={`${tag.id}:${records.length}:${current ? current.id : "free"}`}
                      tagId={tag.id}
                      tagLabel={tag.label}
                      produces={produceOptions}
                      current={
                        current
                          ? {
                              produceId: current.produceId,
                              seed: current.seed,
                              method: current.method,
                            }
                          : null
                      }
                    />
                    {current ? (
                      <PlantNotesPhotoDialog
                        key={`${current.id}:${current.photoMime ?? "none"}`}
                        recordId={current.id}
                        hasPhoto={!!current.photoMime}
                        currentNotes={current.notes}
                        produceName={current.produce?.name ?? "plant"}
                      />
                    ) : null}
                    {current ? <EndAllocationButton tagId={tag.id} tagLabel={tag.label} /> : null}
                    <DeleteTagButton tagId={tag.id} tagLabel={tag.label} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
