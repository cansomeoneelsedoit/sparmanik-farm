import Link from "next/link";
import { getLocale } from "next-intl/server";
import { BookOpen, Droplets, Gauge, Timer, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { SopTodayCard as CardData } from "@/server/sop-today";

/**
 * "Today on the SOP" alert — one card per assigned SOP on a live cycle. Shows
 * the HST, the day's feed settings and the job for the day (EN/ID by locale),
 * plus what's coming in the next 3 days.
 */
export async function SopTodayCard({ card, compact }: { card: CardData; compact?: boolean }) {
  const locale = (await getLocale()) as "en" | "id";
  const title = locale === "id" ? card.sopTitleId : card.sopTitleEn;
  const job = card.day ? (locale === "id" ? card.day.jobId ?? card.day.jobEn : card.day.jobEn ?? card.day.jobId) : null;
  const beforeStart = card.hst < 0;
  const past = card.lastDay != null && card.hst > card.lastDay;
  const stageClass =
    card.day?.stage === "GROW"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
      : card.day?.stage === "FLOWER"
        ? "bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300"
        : card.day?.stage === "SIZING"
          ? "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
          : card.day?.stage === "RIPEN"
            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            : "bg-muted text-foreground";

  return (
    <Card className={job ? "border-l-4 border-l-amber-500" : "border-l-4 border-l-emerald-500"}>
      <CardContent className={compact ? "space-y-2 p-3" : "space-y-3 p-4"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Link href={`/sops/${card.sopId}`} className="truncate font-medium hover:underline">
              {title}
            </Link>
            <span className="text-xs text-muted-foreground">
              · {card.greenhouseName} ·{" "}
              <Link href={`/harvest/${card.harvestId}`} className="hover:underline">
                {card.harvestName}
              </Link>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge className="font-mono text-xs" variant="secondary">
              HST {card.hst}
            </Badge>
            {card.day?.stage ? <Badge className={`border-transparent text-[10px] ${stageClass}`}>{card.day.stage}</Badge> : null}
          </div>
        </div>

        {beforeStart ? (
          <p className="text-sm text-muted-foreground">
            {locale === "id" ? `Pindah tanam ${card.hst0} — belum dimulai.` : `Transplant on ${card.hst0} — not started yet.`}
          </p>
        ) : past ? (
          <p className="text-sm text-muted-foreground">
            {locale === "id" ? "Jadwal SOP sudah selesai untuk siklus ini." : "The SOP schedule has finished for this cycle."}
          </p>
        ) : card.day ? (
          <>
            {job ? (
              <div className="rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                {locale === "id" ? "Tugas hari ini: " : "Job today: "}
                {job}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                {locale === "id" ? "Rutin saja hari ini — pakan & air sesuai di bawah." : "Routine day — feed & water as below."}
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <div className="flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  EC <strong>{card.day.ec ?? "—"}</strong> µS{card.day.ppm ? ` · ${card.day.ppm} ppm` : ""}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Droplets className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  <strong>{card.day.waterMl ?? "—"} mL</strong>/polybag
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  {card.day.pulses ?? "—"}
                  {card.day.times ? ` · ${card.day.times}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                <span>SOP {card.day.sopPerTank ?? "—"}/tank</span>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {locale === "id" ? `Tidak ada baris untuk HST ${card.hst}.` : `No schedule row for HST ${card.hst}.`}
          </p>
        )}

        {!compact && card.upcoming.length ? (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{locale === "id" ? "Berikutnya: " : "Coming up: "}</span>
            {card.upcoming.map((u, i) => (
              <span key={u.day}>
                {i ? " · " : ""}HST {u.day} — {locale === "id" ? u.jobId ?? u.jobEn : u.jobEn ?? u.jobId}
              </span>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
