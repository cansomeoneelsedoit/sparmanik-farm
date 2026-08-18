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
import { SopMarkdown } from "@/app/(app)/sops/sop-markdown";
import { FormatProgress } from "@/app/(app)/sops/format-progress";
import { BookOpen, FileText } from "lucide-react";
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
  type StepRow = { id: string; position: number; bodyEn: string; bodyId: string; formatted: boolean };
  const steps = sop.steps as StepRow[];
  const isBook = days.length > 0 || !!sop.sourceEnPath || !!sop.sourceIdPath;
  const t = (en: string, id: string) => (locale === "id" ? id : en);
  const stageClass = (st: string | null) =>
    st === "GROW" ? "bg-emerald-50 dark:bg-emerald-950/20" : st === "FLOWER" ? "bg-pink-50 dark:bg-pink-950/20" : st === "SIZING" ? "bg-sky-50 dark:bg-sky-950/20" : st === "RIPEN" ? "bg-amber-50 dark:bg-amber-950/20" : "";
  const stageBadge = (st: string | null) =>
    st === "GROW" ? "bg-emerald-600" : st === "FLOWER" ? "bg-pink-600" : st === "SIZING" ? "bg-sky-600" : st === "RIPEN" ? "bg-amber-600" : "bg-muted-foreground";
  const stageLabel = (st: string | null) =>
    locale === "id"
      ? st === "GROW" ? "TUMBUH" : st === "FLOWER" ? "BUNGA" : st === "SIZING" ? "PEMBESARAN" : st === "RIPEN" ? "MATANG" : st ?? ""
      : st ?? "";
  // Group consecutive days by stage for the legend chips.
  const stageGroups: { stage: string | null; from: number; to: number }[] = [];
  for (const d of days) {
    const g = stageGroups[stageGroups.length - 1];
    if (g && g.stage === d.stage) g.to = d.day;
    else stageGroups.push({ stage: d.stage, from: d.day, to: d.day });
  }
  /** First markdown heading of a formatted page (for the contents list). */
  const pageTitle = (st: StepRow) => {
    const body = t(st.bodyEn, st.bodyId);
    const m = /^#{1,3}\s+(.+)$/m.exec(body);
    const first = body.split(String.fromCharCode(10)).find((l) => l.trim())?.trim() ?? "";
    return (m ? m[1] : first).replace(/\*\*/g, "").slice(0, 90);
  };

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

      {/* Description + source books + formatting state */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0 text-sm text-muted-foreground">
            {sop.descriptionEn || sop.descriptionId ? <LocalizedText en={sop.descriptionEn} id={sop.descriptionId} /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sop.sourceEnPath ? (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/uploads/${sop.sourceEnPath}`} target="_blank" rel="noreferrer"><FileText className="h-3.5 w-3.5" /> Original PDF (EN)</a>
              </Button>
            ) : null}
            {sop.sourceIdPath ? (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/uploads/${sop.sourceIdPath}`} target="_blank" rel="noreferrer"><FileText className="h-3.5 w-3.5" /> PDF asli (ID)</a>
              </Button>
            ) : null}
            {isBook ? <FormatProgress sopId={sop.id} done={sop.formatDone} total={sop.formatTotal} /> : null}
          </div>
        </CardContent>
      </Card>

      {assignments.length ? (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("Running on", "Berjalan di")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {assignments.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div>
                  <Link href={`/harvest/${a.harvest.id}`} className="font-medium hover:underline">{a.harvest.name}</Link>
                  <span className="text-muted-foreground"> · {a.harvest.greenhouse.name} · HST 0 = {a.hst0.toISOString().slice(0, 10)}</span>
                  {a.harvest.status === "LIVE" ? (
                    <Badge variant="secondary" className="ml-2 font-mono text-[10px]">{t("today", "hari ini")} HST {hstFor(a.hst0)}</Badge>
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
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 font-serif text-xl">
              {t("Day-by-day schedule", "Jadwal hari per hari")}
              <Badge variant="secondary" className="font-sans text-xs">{days.length} {t("days", "hari")}</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t(
                "Find today. Read across: stage, EC to set, water per polybag, pulses & times, and the job due. ★ = today on a live cycle.",
                "Cari hari ini. Baca mendatar: tahap, EC yang diset, air per polybag, siraman & jam, dan tugas hari itu. ★ = hari ini di siklus aktif.",
              )}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {stageGroups.map((g) => (
                <span key={`${g.stage}-${g.from}`} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]">
                  <span className={`h-2 w-2 rounded-full ${stageBadge(g.stage)}`} />
                  {stageLabel(g.stage)} · HST {g.from}–{g.to}
                </span>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-background text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b">
                    <th className="p-2 text-left">HST</th>
                    <th className="p-2 text-left">{t("Stage", "Tahap")}</th>
                    <th className="p-2 text-right">EC µS</th>
                    <th className="p-2 text-right">ppm</th>
                    <th className="p-2 text-right">SOP /1000 L</th>
                    <th className="p-2 text-right">{t("Water / polybag", "Air / polybag")}</th>
                    <th className="p-2 text-left">{t("Pulses", "Siraman")}</th>
                    <th className="p-2 text-left">{t("Times", "Jam")}</th>
                    <th className="p-2 text-left">{t("Job for the day", "Tugas hari itu")}</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d, i) => {
                    const isToday = todayHsts.has(d.day);
                    const job = locale === "id" ? d.jobId ?? d.jobEn : d.jobEn ?? d.jobId;
                    const newStage = i === 0 || days[i - 1].stage !== d.stage;
                    return (
                      <tr key={d.id} className={`border-t ${stageClass(d.stage)} ${isToday ? "ring-2 ring-inset ring-amber-400" : ""}`}>
                        <td className="p-2 font-mono text-xs font-semibold">{d.day}{isToday ? " ★" : ""}</td>
                        <td className="p-2 text-xs">
                          {newStage ? (
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${stageBadge(d.stage)}`}>{stageLabel(d.stage)}</span>
                          ) : (
                            <span className="text-muted-foreground/60">{stageLabel(d.stage)}</span>
                          )}
                        </td>
                        <td className="p-2 text-right font-mono text-xs">{d.ec ?? "—"}</td>
                        <td className="p-2 text-right font-mono text-xs text-muted-foreground">{d.ppm ?? "—"}</td>
                        <td className="p-2 text-right font-mono text-xs">{d.sopPerTank ?? "—"}</td>
                        <td className="p-2 text-right font-mono text-xs">{d.waterMl != null ? `${d.waterMl} mL` : "—"}</td>
                        <td className="p-2 text-xs">{d.pulses ?? ""}</td>
                        <td className="p-2 text-xs text-muted-foreground">{d.times ?? ""}</td>
                        <td className={`p-2 text-xs ${job ? "font-medium" : "text-muted-foreground/60"}`}>{job ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* The booklet, page by page */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-serif text-xl">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
            {isBook ? t("The book", "Buku") : "Steps"}
            <Badge variant="secondary" className="font-sans text-xs">{steps.length} {isBook ? t("pages", "halaman") : "steps"}</Badge>
          </CardTitle>
          {isBook && steps.length > 6 ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">{t("Contents", "Daftar isi")}</summary>
              <ol className="mt-2 grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
                {steps.map((st) => (
                  <li key={st.id} className="truncate">
                    <a href={`#page-${st.position}`} className="hover:underline">
                      <span className="mr-1 font-mono">{st.position}.</span>
                      {pageTitle(st) || `${t("Page", "Halaman")} ${st.position}`}
                    </a>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <div className="text-sm text-muted-foreground">No steps yet.</div>
          ) : (
            <ol className={isBook ? "space-y-6" : "space-y-3"}>
              {steps.map((st) => (
                <li key={st.id} id={`page-${st.position}`} className={isBook ? "rounded-lg border bg-card p-5 shadow-sm" : "rounded-md border p-3 text-sm"}>
                  <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
                    <span>{isBook ? `${t("Page", "Halaman")} ${st.position}` : `Step ${st.position + 1}`}</span>
                    {isBook && !st.formatted ? <span className="italic">{t("formatting…", "memformat…")}</span> : null}
                  </div>
                  {st.formatted ? (
                    <SopMarkdown text={t(st.bodyEn, st.bodyId)} />
                  ) : (
                    <div className="whitespace-pre-wrap text-sm"><LocalizedText en={st.bodyEn} id={st.bodyId} /></div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
