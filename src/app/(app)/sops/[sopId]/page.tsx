import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { auth } from "@/auth";
import { LocalizedText } from "@/components/shared/localized-text";
import { SopFormDialog } from "@/app/(app)/sops/sop-form-dialog";
import { SopActions } from "@/app/(app)/sops/[sopId]/sop-actions";
import { BuildCourseButton } from "@/app/(app)/sops/build-course-button";
import { AssignSopDialog, UnassignSopButton } from "@/app/(app)/sops/sop-pdf-dialogs";
import { getLocale } from "next-intl/server";
import { todayWIB } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function SopDetailPage({ params }: { params: Promise<{ sopId: string }> }) {
  const { sopId } = await params;
  const session = await auth();
  const isSuperuser = session?.user?.role === "SUPERUSER";
  // findFirst — see harvest detail page for the rationale.
  const sop = await prisma.sop.findFirst({
    where: { id: sopId },
    include: {
      steps: { orderBy: { position: "asc" } },
      days: { orderBy: { day: "asc" } },
      assignments: {
        select: { id: true, hst0: true, harvest: { select: { id: true, name: true, status: true, greenhouse: { select: { name: true } } } } },
      },
    },
  });
  if (!sop) notFound();
  const locale = (await getLocale()) as "en" | "id";
  const liveHarvests = (await prisma.harvest.findMany({
    where: { status: "LIVE" },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, startDate: true, transplantDate: true, greenhouse: { select: { name: true } } },
  })) as { id: string; name: string; startDate: Date; transplantDate: Date | null; greenhouse: { name: string } }[];
  type DayRow = { id: string; day: number; stage: string | null; ec: number | null; ppm: number | null; sopPerTank: string | null; waterMl: number | null; pulses: string | null; times: string | null; jobEn: string | null; jobId: string | null };
  const days = sop.days as DayRow[];
  type Assign = { id: string; hst0: Date; harvest: { id: string; name: string; status: string; greenhouse: { name: string } } };
  const assignments = sop.assignments as Assign[];
  const today = todayWIB();
  const hstFor = (hst0: Date) => Math.round((Date.parse(today) - Date.parse(hst0.toISOString().slice(0, 10))) / 86_400_000);
  const todayHsts = new Set(assignments.filter((a) => a.harvest.status === "LIVE").map((a) => hstFor(a.hst0)));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sops"><ArrowLeft className="h-4 w-4" /> SOPs</Link>
          </Button>
          <h1 className="font-serif text-3xl">
            <LocalizedText en={sop.titleEn} id={sop.titleId} />
          </h1>
          <Badge variant={sop.status === "ACTIVE" ? "accent" : "secondary"}>{sop.status}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <AssignSopDialog
            sopId={sop.id}
            harvests={liveHarvests.map((h) => ({ id: h.id, name: h.name, greenhouse: h.greenhouse.name, startDate: (h.transplantDate ?? h.startDate).toISOString().slice(0, 10) }))}
          />
          {isSuperuser ? <BuildCourseButton sopId={sop.id} /> : null}
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

      {assignments.length ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Running on</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {assignments.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div>
                  <Link href={`/harvest/${a.harvest.id}`} className="font-medium hover:underline">{a.harvest.name}</Link>
                  <span className="text-muted-foreground"> · {a.harvest.greenhouse.name} · HST 0 = {a.hst0.toISOString().slice(0, 10)}</span>
                  {a.harvest.status === "LIVE" ? (
                    <Badge variant="secondary" className="ml-2 font-mono text-[10px]">today HST {hstFor(a.hst0)}</Badge>
                  ) : (
                    <Badge variant="outline" className="ml-2 text-[10px]">closed</Badge>
                  )}
                </div>
                <UnassignSopButton assignmentId={a.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {days.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{locale === "id" ? "Jadwal hari per hari" : "Day-by-day schedule"} <Badge variant="secondary" className="ml-2">{days.length} {locale === "id" ? "hari" : "days"}</Badge></CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">HST</th>
                    <th className="p-2 text-left">{locale === "id" ? "Tahap" : "Stage"}</th>
                    <th className="p-2 text-right">EC µS</th>
                    <th className="p-2 text-right">ppm</th>
                    <th className="p-2 text-right">SOP/tank</th>
                    <th className="p-2 text-right">{locale === "id" ? "Air/polybag" : "Water/polybag"}</th>
                    <th className="p-2 text-left">{locale === "id" ? "Siraman" : "Pulses"}</th>
                    <th className="p-2 text-left">{locale === "id" ? "Jam" : "Times"}</th>
                    <th className="p-2 text-left">{locale === "id" ? "Tugas hari itu" : "Job for the day"}</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => {
                    const isToday = todayHsts.has(d.day);
                    const job = locale === "id" ? d.jobId ?? d.jobEn : d.jobEn ?? d.jobId;
                    return (
                      <tr key={d.id} className={`border-t ${isToday ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}>
                        <td className="p-2 font-mono text-xs">{d.day}{isToday ? " ★" : ""}</td>
                        <td className="p-2 text-xs">{d.stage ?? ""}</td>
                        <td className="p-2 text-right font-mono text-xs">{d.ec ?? "—"}</td>
                        <td className="p-2 text-right font-mono text-xs">{d.ppm ?? "—"}</td>
                        <td className="p-2 text-right font-mono text-xs">{d.sopPerTank ?? "—"}</td>
                        <td className="p-2 text-right font-mono text-xs">{d.waterMl != null ? `${d.waterMl} mL` : "—"}</td>
                        <td className="p-2 text-xs">{d.pulses ?? ""}</td>
                        <td className="p-2 text-xs">{d.times ?? ""}</td>
                        <td className={`p-2 text-xs ${job ? "font-medium" : "text-muted-foreground"}`}>{job ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>{days.length ? (locale === "id" ? "Bagian buku" : "Booklet sections") : "Steps"}</CardTitle></CardHeader>
        <CardContent>
          {sop.steps.length === 0 ? (
            <div className="text-sm text-muted-foreground">No steps yet.</div>
          ) : (
            <ol className="space-y-3">
              {(sop.steps as { id: string; position: number; bodyEn: string; bodyId: string }[]).map((s) => (
                <li key={s.id} className="rounded-md border p-3 text-sm">
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">{days.length ? `Page ${s.position}` : `Step ${s.position + 1}`}</div>
                  <div className="whitespace-pre-wrap"><LocalizedText en={s.bodyEn} id={s.bodyId} /></div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
