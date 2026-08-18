import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Map, Sprout } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AssignPlantDialog,
  EndAllocationButton,
  PlantNotesPhotoDialog,
  ShowQrDialog,
} from "@/app/(app)/tags/tag-dialogs";
import { listTrays } from "@/app/(app)/tags/actions";
import type { PlantNoteKind } from "@/app/(app)/tags/journal-kinds";
import { AddJournalEntryDialog, JournalTimeline, type JournalEntry } from "@/app/(app)/t/[code]/plant-journal";
import { MeasureDialog, MeasurementList, type MeasurementRow } from "@/app/(app)/t/[code]/plant-measure";
import { LineChart } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * The page a QR stake opens when scanned in the greenhouse (/t/<code>).
 * Mobile-first: what's growing on this stake right now — produce, planted
 * date, days growing, seed, method, notes — plus the stake's crop history.
 * Behind the normal sign-in (the proxy fences PORTAL students away).
 */
export default async function TagScanPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  // PlantTag is org-scoped — a tag from another org 404s.
  const tag = await prisma.plantTag.findFirst({
    where: { code },
    select: {
      id: true,
      label: true,
      greenhouse: { select: { id: true, name: true } },
      produce: { select: { id: true, name: true, photoMime: true } },
      records: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          plantedAt: true,
          endedAt: true,
          seed: true,
          tray: true,
          method: true,
          notes: true,
          // photoMime (small) tells us a photo exists without pulling the blob.
          photoMime: true,
          produceId: true,
          produce: { select: { name: true } },
          harvest: { select: { id: true, name: true } },
          measurements: {
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            select: { id: true, date: true, hst: true, heightCm: true, leafCount: true, stemMm: true, fruitCm: true, fruitG: true, brix: true, note: true },
          },
          journal: {
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              date: true,
              kind: true,
              product: true,
              amount: true,
              note: true,
              photoMime: true,
            },
          },
        },
      },
    },
  });
  if (!tag) notFound();

  const [produces, trays] = await Promise.all([
    prisma.produce.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }) as Promise<{ id: string; name: string }[]>,
    listTrays(tag.greenhouse.id),
  ]);

  type JournalRow = {
    id: string;
    date: Date;
    kind: string;
    product: string | null;
    amount: string | null;
    note: string;
    photoMime: string | null;
  };
  type MeasureRaw = { id: string; date: Date; hst: number | null; heightCm: unknown; leafCount: number | null; stemMm: unknown; fruitCm: unknown; fruitG: unknown; brix: unknown; note: string | null };
  const toMeasurements = (rows: MeasureRaw[]): MeasurementRow[] =>
    rows.map((m) => ({
      id: m.id,
      date: new Date(m.date).toISOString().slice(0, 10),
      hst: m.hst,
      heightCm: m.heightCm == null ? null : Number(m.heightCm),
      leafCount: m.leafCount,
      stemMm: m.stemMm == null ? null : Number(m.stemMm),
      fruitCm: m.fruitCm == null ? null : Number(m.fruitCm),
      fruitG: m.fruitG == null ? null : Number(m.fruitG),
      brix: m.brix == null ? null : Number(m.brix),
      note: m.note,
    }));
  type RecordRow = {
    id: string;
    plantedAt: Date;
    endedAt: Date | null;
    seed: string | null;
    tray: string | null;
    measurements: MeasureRaw[];
    method: string | null;
    notes: string | null;
    photoMime: string | null;
    produceId: string | null;
    produce: { name: string } | null;
    harvest: { id: string; name: string } | null;
    journal: JournalRow[];
  };
  const records = tag.records as RecordRow[];
  const current = records.find((r) => r.endedAt === null) ?? null;
  const history = records.filter((r) => r.endedAt !== null);
  const toEntries = (r: RecordRow): JournalEntry[] =>
    r.journal.map((j) => ({
      id: j.id,
      date: new Date(j.date).toISOString().slice(0, 10),
      kind: j.kind as PlantNoteKind,
      product: j.product,
      amount: j.amount,
      note: j.note,
      hasPhoto: !!j.photoMime,
      hst: Math.round((new Date(j.date).getTime() - new Date(r.plantedAt).getTime()) / 86_400_000),
    }));
  // Layout variety planned for this stake (from the greenhouse layout).
  const planned = (tag as { produce: { id: string; name: string; photoMime: string | null } | null })
    .produce;
  const nowMs = new Date().getTime();
  const fmt = (d: Date) => new Date(d).toISOString().slice(0, 10);
  const daysSince = (d: Date) =>
    Math.max(0, Math.floor((nowMs - new Date(d).getTime()) / 86_400_000));

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* Back bar — a QR scan lands straight on this page, so give it its own
          way out (thumb-sized targets for the greenhouse phone). */}
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm" className="h-10 sm:h-9">
          <Link href={`/tags?gh=${tag.greenhouse.id}`}>
            <ArrowLeft className="h-4 w-4" /> Tags
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-10 sm:h-9">
          <Link href={`/tags/map/${tag.greenhouse.id}`}>
            <Map className="h-4 w-4" /> Map
          </Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl">
            {tag.label}
          </h1>
          <p className="text-sm text-muted-foreground">{tag.greenhouse.name}</p>
        </div>
        {current ? (
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300">
            Growing
          </Badge>
        ) : (
          <Badge variant="outline">Free</Badge>
        )}
      </header>

      {current ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sprout className="h-5 w-5 text-emerald-600" />
              {current.produce?.name ?? "Unnamed plant"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {current.photoMime ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/plant-records/${current.id}/photo`}
                alt={`${current.produce?.name ?? "Plant"} photo`}
                className="max-h-72 w-full rounded-md border object-contain bg-muted/30"
              />
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Planted</div>
                <div className="font-medium">{fmt(current.plantedAt)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Growing for</div>
                <div className="font-medium">{daysSince(current.plantedAt)} days</div>
              </div>
            </div>
            {current.seed || current.tray ? (
              <div className="grid grid-cols-2 gap-3">
                {current.seed ? (
                  <div>
                    <div className="text-xs text-muted-foreground">Seed</div>
                    <div>{current.seed}</div>
                  </div>
                ) : null}
                {current.tray ? (
                  <div>
                    <div className="text-xs text-muted-foreground">From tray</div>
                    <div className="font-medium">{current.tray}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {current.method ? (
              <div>
                <div className="text-xs text-muted-foreground">Method</div>
                <div>{current.method}</div>
              </div>
            ) : null}
            {current.notes ? (
              <div>
                <div className="text-xs text-muted-foreground">Notes</div>
                <div className="whitespace-pre-wrap">{current.notes}</div>
              </div>
            ) : null}
            {current.harvest ? (
              <div>
                <div className="text-xs text-muted-foreground">Cycle</div>
                <Link href={`/harvest/${current.harvest.id}`} className="text-accent hover:underline">
                  {current.harvest.name}
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-3 p-6 text-center text-sm text-muted-foreground">
            {planned ? (
              <>
                {planned.photoMime ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/produce/${planned.id}/photo`}
                    alt={planned.name}
                    className="mx-auto max-h-44 rounded-md border object-contain bg-muted/30"
                  />
                ) : null}
                <div>
                  Free stake — laid out for{" "}
                  <span className="font-medium text-foreground">{planned.name}</span>. Plant it to
                  start its record.
                </div>
              </>
            ) : (
              <div>Nothing staked here right now — assign the next plant when you replant.</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions — 2-up grid on phones (big tap targets), inline row on larger
          screens. */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <ShowQrDialog
          tagId={tag.id}
          tagLabel={tag.label}
          code={code}
          greenhouseName={tag.greenhouse.name}
        />
        <AssignPlantDialog
          key={`${tag.id}:${records.length}:${current ? current.id : "free"}`}
          tagId={tag.id}
          tagLabel={tag.label}
          produces={produces}
          current={
            current
              ? { produceId: current.produceId, seed: current.seed, method: current.method, tray: current.tray }
              : null
          }
          defaultProduceId={planned?.id ?? null}
          trays={trays}
        />
        {current ? (
          <PlantNotesPhotoDialog
            key={`${current.id}:${current.photoMime ?? "none"}:${current.tray ?? ""}`}
            recordId={current.id}
            hasPhoto={!!current.photoMime}
            currentNotes={current.notes}
            currentTray={current.tray}
            trays={trays}
            produceName={current.produce?.name ?? "plant"}
          />
        ) : null}
        {current ? <EndAllocationButton tagId={tag.id} tagLabel={tag.label} /> : null}
      </div>

      {current ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">Growth measurements</CardTitle>
            <div className="flex flex-wrap gap-2">
              {current.produceId ? (
                <Button asChild variant="ghost" size="sm" className="h-10 sm:h-9">
                  <Link href={`/tags/growth?produce=${current.produceId}`}>
                    <LineChart className="h-3.5 w-3.5" /> Variety chart
                  </Link>
                </Button>
              ) : null}
              <MeasureDialog recordId={current.id} tagLabel={tag.label} />
            </div>
          </CardHeader>
          <CardContent>
            <MeasurementList rows={toMeasurements(current.measurements)} />
          </CardContent>
        </Card>
      ) : null}

      {current ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">Journal</CardTitle>
            <AddJournalEntryDialog recordId={current.id} tagLabel={tag.label} />
          </CardHeader>
          <CardContent>
            <JournalTimeline entries={toEntries(current)} />
          </CardContent>
        </Card>
      ) : null}

      {history.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Previous crops on this stake</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((r) => (
              <div key={r.id} className="border-b pb-2 text-sm last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{r.produce?.name ?? "Unnamed plant"}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmt(r.plantedAt)} → {r.endedAt ? fmt(r.endedAt) : "…"}
                      {r.seed ? ` · ${r.seed}` : ""}
                      {r.tray ? ` · tray ${r.tray}` : ""}
                    </div>
                  </div>
                  {r.harvest ? (
                    <Link
                      href={`/harvest/${r.harvest.id}`}
                      className="shrink-0 text-xs text-accent hover:underline"
                    >
                      {r.harvest.name}
                    </Link>
                  ) : null}
                </div>
                {r.journal.length ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      {r.journal.length} journal entr{r.journal.length === 1 ? "y" : "ies"}
                    </summary>
                    <div className="mt-2">
                      <JournalTimeline entries={toEntries(r)} />
                    </div>
                  </details>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
