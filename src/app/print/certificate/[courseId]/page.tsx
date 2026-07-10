import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { getActiveOrgId } from "@/server/org";
import { prisma } from "@/server/prisma";
import { isEnrolledOrFree } from "@/server/enrollment";
import { pickLocalized } from "@/components/shared/localized-text";
import { ReportToolbar } from "@/app/print/harvest/[harvestId]/report-toolbar";

export const dynamic = "force-dynamic";

/**
 * Printable course-completion certificate — an A4 LANDSCAPE sheet outside the
 * (app) layout, same pattern as the harvest report: no PDF library, the
 * browser's own print engine renders it (ReportToolbar auto-opens the print
 * dialog via ?auto=1 → Save as PDF).
 *
 * The certificate is only ever issued to THE SIGNED-IN USER, and only when the
 * latest attempt at EVERY module of the (published, org-scoped) course passed
 * — same "latest attempt wins" rule as the course pages, so a failed retake
 * revokes the certificate until it's passed again.
 */
export default async function CertificatePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  // Explicit org guard: this route lives outside the (app) layout, so don't
  // lean only on the Prisma org-scoping extension.
  const activeOrgId = await getActiveOrgId();
  if (!activeOrgId) notFound();
  const { courseId } = await params;
  const { auto } = await searchParams;
  const rawLocale = await getLocale();
  const locale: "en" | "id" = rawLocale === "id" ? "id" : "en";
  const t = await getTranslations("training");

  // Published only — no certificates for drafts, even for the superuser.
  const course = (await prisma.course.findFirst({
    where: { id: courseId, published: true },
    select: {
      id: true,
      organizationId: true,
      titleEn: true,
      titleId: true,
      modules: {
        orderBy: { rank: "asc" },
        select: { module: { select: { id: true } } },
      },
    },
  })) as {
    id: string;
    organizationId: string | null;
    titleEn: string;
    titleId: string;
    modules: { module: { id: string } }[];
  } | null;
  if (!course || course.organizationId !== activeOrgId) notFound();

  // Paid-course gate: a certificate is course content. If the course is priced
  // and the user isn't enrolled, no certificate — even when the modules were
  // reused from a free course and their attempts happen to have passed.
  // (Superusers pass via the role short-circuit inside isEnrolledOrFree.)
  if (!(await isEnrolledOrFree(course.id, session.user.id, session.user.role))) notFound();

  // Latest attempt per module for the signed-in user, WITH dates — the
  // certificate needs the completion date, which the shared progress helper
  // doesn't carry. Same overwrite-reduce over oldest→newest ordering.
  const moduleIds = course.modules.map((m) => m.module.id);
  const attempts = (await prisma.moduleAttempt.findMany({
    where: { userId: session.user.id, moduleId: { in: moduleIds } },
    orderBy: { createdAt: "asc" },
    select: { moduleId: true, passed: true, score: true, createdAt: true },
  })) as { moduleId: string; passed: boolean; score: number; createdAt: Date }[];
  const latest = new Map<string, { passed: boolean; score: number; createdAt: Date }>();
  for (const a of attempts) {
    latest.set(a.moduleId, { passed: a.passed, score: a.score, createdAt: a.createdAt });
  }
  const completed =
    moduleIds.length > 0 && moduleIds.every((id) => latest.get(id)?.passed);

  const courseTitle = pickLocalized({ en: course.titleEn, id: course.titleId }, locale);

  // ---- Not finished yet → friendly page, no certificate -------------------
  if (!completed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 p-6">
        <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <h1 className="font-serif text-2xl text-zinc-900">{t("certNotDoneTitle")}</h1>
          <p className="mt-2 text-sm text-zinc-600">{t("certNotDoneBody")}</p>
          <a
            href={`/training/${course.id}`}
            className="mt-5 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {t("backToCourse")}
          </a>
        </div>
      </div>
    );
  }

  // ---- Certificate data ----------------------------------------------------
  const latestRows = moduleIds.map((id) => latest.get(id)!);
  // Completion date = the moment the LAST module was (last) passed.
  const completedAt = latestRows.reduce(
    (max, r) => (r.createdAt > max ? r.createdAt : max),
    latestRows[0].createdAt,
  );
  const avgScore = Math.round(
    latestRows.reduce((sum, r) => sum + r.score, 0) / latestRows.length,
  );
  const dateStr = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", {
    dateStyle: "long",
    timeZone: "Asia/Jakarta",
  }).format(completedAt);

  const org = await prisma.organization.findUnique({
    where: { id: activeOrgId },
    select: { name: true },
  });
  const orgName = org?.name ?? "Sparmanik Farm";
  const userName = session.user.name ?? session.user.email ?? "";
  // Monogram for the seal — initials of the first two org-name words.
  const monogram =
    orgName
      .split(/\s+/)
      .filter(Boolean)
      .map((w: string) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "SF";

  return (
    <div className="print-cert min-h-screen bg-zinc-100 py-6 text-zinc-900">
      {/* Global print rules — A4 LANDSCAPE, hide the toolbar, force light
          colours. Scoped to this dedicated route. */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .print-cert { background: #fff !important; padding: 0 !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; width: 100%; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <ReportToolbar autoPrint={auto === "1"} />

      {/* Landscape sheet — the aspect ratio mirrors A4 landscape on screen so
          what Boyd sees is what prints. */}
      <div
        className="sheet mx-auto flex w-full max-w-[1000px] bg-white p-5 shadow-sm"
        style={{ aspectRatio: "297 / 210" }}
      >
        {/* Double-rule ornament: heavy outer frame + hairline inner frame,
            with gold corner accents just inside the inner rule. */}
        <div
          className="flex w-full"
          style={{ border: "3px double #713f12", padding: "6px" }}
        >
          <div
            className="relative flex w-full flex-col items-center justify-center gap-4 px-12 py-8 text-center"
            style={{ border: "1px solid #a16207" }}
          >
            {/* Corner accents — four gold L-shapes. */}
            <div
              aria-hidden
              className="absolute left-2 top-2 h-6 w-6"
              style={{ borderTop: "2px solid #a16207", borderLeft: "2px solid #a16207" }}
            />
            <div
              aria-hidden
              className="absolute right-2 top-2 h-6 w-6"
              style={{ borderTop: "2px solid #a16207", borderRight: "2px solid #a16207" }}
            />
            <div
              aria-hidden
              className="absolute bottom-2 left-2 h-6 w-6"
              style={{ borderBottom: "2px solid #a16207", borderLeft: "2px solid #a16207" }}
            />
            <div
              aria-hidden
              className="absolute bottom-2 right-2 h-6 w-6"
              style={{ borderBottom: "2px solid #a16207", borderRight: "2px solid #a16207" }}
            />

            <div
              className="text-xs font-semibold uppercase text-zinc-500"
              style={{ letterSpacing: "0.35em" }}
            >
              {orgName}
            </div>

            <h1 className="font-serif text-5xl" style={{ color: "#713f12" }}>
              {t("certTitle")}
            </h1>

            {/* Simple rule-diamond-rule divider. */}
            <div className="flex w-full max-w-md items-center gap-3" aria-hidden>
              <span className="h-px flex-1" style={{ background: "#a16207" }} />
              <span
                className="h-2 w-2 rotate-45"
                style={{ background: "#a16207" }}
              />
              <span className="h-px flex-1" style={{ background: "#a16207" }} />
            </div>

            <p className="font-serif text-sm italic text-zinc-600">{t("certPresentedTo")}</p>

            <p
              className="max-w-2xl font-serif text-4xl italic"
              style={{ borderBottom: "1px solid #d4d4d8", paddingBottom: "10px" }}
            >
              {userName}
            </p>

            <p className="font-serif text-sm italic text-zinc-600">{t("certForCompleting")}</p>

            <p className="max-w-2xl font-serif text-2xl font-semibold">
              {courseTitle}
            </p>

            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-8 gap-y-1 font-serif text-sm text-zinc-700">
              <span>{t("certCompletedOn", { date: dateStr })}</span>
              <span aria-hidden className="hidden text-zinc-300 sm:inline">
                |
              </span>
              <span>{t("certAverageScore", { score: avgScore })}</span>
            </div>

            {/* Bottom row: signature (left) · seal (right). */}
            <div className="mt-4 flex w-full items-end justify-between gap-8 px-6">
              <div className="flex flex-1 flex-col items-center gap-1">
                <span className="font-serif text-2xl italic text-zinc-700">
                  Boyd Sparrow
                </span>
                <span
                  aria-hidden
                  className="h-px w-full max-w-[240px]"
                  style={{ background: "#a16207" }}
                />
                <span
                  className="text-[10px] uppercase text-zinc-500"
                  style={{ letterSpacing: "0.2em" }}
                >
                  Boyd Sparrow — {orgName}
                </span>
              </div>

              {/* Seal — double gold ring with the org monogram. */}
              <div
                aria-hidden
                className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
                style={{ border: "2px solid #a16207" }}
              >
                <div
                  className="flex h-[82px] w-[82px] flex-col items-center justify-center gap-1 rounded-full"
                  style={{ border: "1px solid #a16207", background: "#fefce8" }}
                >
                  <span
                    className="font-serif text-3xl leading-none"
                    style={{ color: "#713f12" }}
                  >
                    {monogram}
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className="h-1 w-1 rotate-45"
                      style={{ background: "#a16207" }}
                    />
                    <span
                      className="h-1.5 w-1.5 rotate-45"
                      style={{ background: "#a16207" }}
                    />
                    <span
                      className="h-1 w-1 rotate-45"
                      style={{ background: "#a16207" }}
                    />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
