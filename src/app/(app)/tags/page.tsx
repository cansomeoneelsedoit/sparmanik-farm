import Link from "next/link";
import { Printer, QrCode } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AssignPlantDialog,
  CreateTagsDialog,
  DeleteTagButton,
  EndAllocationButton,
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

  const [tags, produces] = active
    ? await Promise.all([
        prisma.plantTag.findMany({
          where: { greenhouseId: active.id },
          orderBy: { label: "asc" },
          select: {
            id: true,
            code: true,
            label: true,
            records: {
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                plantedAt: true,
                endedAt: true,
                seed: true,
                method: true,
                notes: true,
                produceId: true,
                produce: { select: { name: true } },
              },
            },
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
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
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
