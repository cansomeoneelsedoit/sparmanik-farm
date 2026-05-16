import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LocalizedText } from "@/components/shared/localized-text";
import { SopFormDialog } from "@/app/(app)/sops/sop-form-dialog";
import { SopActions } from "@/app/(app)/sops/[sopId]/sop-actions";

export const dynamic = "force-dynamic";

export default async function SopDetailPage({ params }: { params: Promise<{ sopId: string }> }) {
  const { sopId } = await params;
  const sop = await prisma.sop.findUnique({
    where: { id: sopId },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  if (!sop) notFound();

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sops"><ArrowLeft className="h-4 w-4" /> SOPs</Link>
          </Button>
          <h1 className="font-serif text-3xl">
            <LocalizedText en={sop.titleEn} id={sop.titleId} />
          </h1>
          <Badge variant={sop.status === "ACTIVE" ? "accent" : "secondary"}>{sop.status}</Badge>
        </div>
        <div className="flex gap-2">
          <SopFormDialog
            existing={{
              id: sop.id,
              titleEn: sop.titleEn,
              titleId: sop.titleId,
              descriptionEn: sop.descriptionEn,
              descriptionId: sop.descriptionId,
              category: sop.category,
              steps: sop.steps.map((s: { bodyEn: string; bodyId: string }) => ({ bodyEn: s.bodyEn, bodyId: s.bodyId })),
            }}
            trigger={<Button variant="outline">Edit</Button>}
          />
          <SopActions id={sop.id} status={sop.status} />
        </div>
      </header>

      <Card>
        <CardContent className="space-y-4 p-6">
          {sop.descriptionEn || sop.descriptionId ? (
            <div className="text-sm">
              <LocalizedText en={sop.descriptionEn} id={sop.descriptionId} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Steps</CardTitle></CardHeader>
        <CardContent>
          {sop.steps.length === 0 ? (
            <div className="text-sm text-muted-foreground">No steps yet.</div>
          ) : (
            <ol className="space-y-3">
              {(sop.steps as { id: string; position: number; bodyEn: string; bodyId: string }[]).map((s) => (
                <li key={s.id} className="rounded-md border p-3 text-sm">
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">Step {s.position + 1}</div>
                  <LocalizedText en={s.bodyEn} id={s.bodyId} />
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
