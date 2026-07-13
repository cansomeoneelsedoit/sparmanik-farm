import Link from "next/link";
import { notFound } from "next/navigation";
import { Sprout } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AssignPlantDialog, EndAllocationButton, ShowQrDialog } from "@/app/(app)/tags/tag-dialogs";

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
          harvest: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!tag) notFound();

  const produces = (await prisma.produce.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })) as { id: string; name: string }[];

  type RecordRow = {
    id: string;
    plantedAt: Date;
    endedAt: Date | null;
    seed: string | null;
    method: string | null;
    notes: string | null;
    produceId: string | null;
    produce: { name: string } | null;
    harvest: { id: string; name: string } | null;
  };
  const records = tag.records as RecordRow[];
  const current = records.find((r) => r.endedAt === null) ?? null;
  const history = records.filter((r) => r.endedAt !== null);
  const nowMs = new Date().getTime();
  const fmt = (d: Date) => new Date(d).toISOString().slice(0, 10);
  const daysSince = (d: Date) =>
    Math.max(0, Math.floor((nowMs - new Date(d).getTime()) / 86_400_000));

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div>
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
            {current.seed ? (
              <div>
                <div className="text-xs text-muted-foreground">Seed</div>
                <div>{current.seed}</div>
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
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nothing staked here right now — assign the next plant when you replant.
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
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
              ? { produceId: current.produceId, seed: current.seed, method: current.method }
              : null
          }
        />
        {current ? <EndAllocationButton tagId={tag.id} tagLabel={tag.label} /> : null}
        <Link
          href={`/tags?gh=${tag.greenhouse.id}`}
          className="ml-auto self-center text-sm text-muted-foreground hover:underline"
        >
          All tags →
        </Link>
      </div>

      {history.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Previous crops on this stake</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-0 last:pb-0">
                <div className="min-w-0">
                  <div className="font-medium">{r.produce?.name ?? "Unnamed plant"}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmt(r.plantedAt)} → {r.endedAt ? fmt(r.endedAt) : "…"}
                    {r.seed ? ` · ${r.seed}` : ""}
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
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
