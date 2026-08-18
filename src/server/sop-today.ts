import { prisma } from "@/server/prisma";
import { todayWIB } from "@/lib/date";

export type SopTodayCard = {
  assignmentId: string;
  sopId: string;
  sopTitleEn: string;
  sopTitleId: string;
  harvestId: string;
  harvestName: string;
  greenhouseName: string;
  hst0: string;
  hst: number;
  /** null when today is before HST 0 or beyond the schedule. */
  day: {
    stage: string | null;
    ec: number | null;
    ppm: number | null;
    sopPerTank: string | null;
    waterMl: number | null;
    pulses: string | null;
    times: string | null;
    jobEn: string | null;
    jobId: string | null;
  } | null;
  /** Upcoming jobs in the next 3 days (so the team can prep). */
  upcoming: { day: number; jobEn: string | null; jobId: string | null }[];
  lastDay: number | null;
};

const dayUTC = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/**
 * For every SOP assigned to a LIVE cycle (optionally one harvest), work out
 * today's HST and pull that day's row + the next few jobs. Org-scoped through
 * the harvestSop query.
 */
export async function sopTodayCards(opts: { harvestId?: string } = {}): Promise<SopTodayCard[]> {
  const rows = (await prisma.harvestSop.findMany({
    where: { ...(opts.harvestId ? { harvestId: opts.harvestId } : {}), harvest: { status: "LIVE" } },
    select: {
      id: true,
      hst0: true,
      sop: {
        select: {
          id: true,
          titleEn: true,
          titleId: true,
          days: {
            orderBy: { day: "asc" },
            select: {
              day: true,
              stage: true,
              ec: true,
              ppm: true,
              sopPerTank: true,
              waterMl: true,
              pulses: true,
              times: true,
              jobEn: true,
              jobId: true,
            },
          },
        },
      },
      harvest: { select: { id: true, name: true, greenhouse: { select: { name: true } } } },
    },
  })) as {
    id: string;
    hst0: Date;
    sop: {
      id: string;
      titleEn: string;
      titleId: string;
      days: SopTodayCard["day"] extends infer D ? (NonNullable<D> & { day: number })[] : never;
    };
    harvest: { id: string; name: string; greenhouse: { name: string } };
  }[];

  const today = todayWIB();
  const out: SopTodayCard[] = [];
  for (const r of rows) {
    const hst0 = r.hst0.toISOString().slice(0, 10);
    const hst = Math.round((dayUTC(today) - dayUTC(hst0)) / 86_400_000);
    const day = r.sop.days.find((d) => d.day === hst) ?? null;
    const upcoming = r.sop.days
      .filter((d) => d.day > hst && d.day <= hst + 3 && (d.jobEn || d.jobId))
      .map((d) => ({ day: d.day, jobEn: d.jobEn, jobId: d.jobId }));
    out.push({
      assignmentId: r.id,
      sopId: r.sop.id,
      sopTitleEn: r.sop.titleEn,
      sopTitleId: r.sop.titleId,
      harvestId: r.harvest.id,
      harvestName: r.harvest.name,
      greenhouseName: r.harvest.greenhouse.name,
      hst0,
      hst,
      day: day
        ? {
            stage: day.stage,
            ec: day.ec,
            ppm: day.ppm,
            sopPerTank: day.sopPerTank,
            waterMl: day.waterMl,
            pulses: day.pulses,
            times: day.times,
            jobEn: day.jobEn,
            jobId: day.jobId,
          }
        : null,
      upcoming,
      lastDay: r.sop.days.length ? r.sop.days[r.sop.days.length - 1].day : null,
    });
  }
  return out;
}
