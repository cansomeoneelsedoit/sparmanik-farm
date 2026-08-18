"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import type { TransactionClient } from "@/server/decimal";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const sopSchema = z.object({
  titleEn: z.string().min(1),
  titleId: z.string().min(1),
  descriptionEn: z.string().optional().default(""),
  descriptionId: z.string().optional().default(""),
  category: z.string().optional().default(""),
  steps: z.array(z.object({ bodyEn: z.string().min(1), bodyId: z.string().min(1) })).default([]),
});

export async function createSop(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = sopSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const sop = await prisma.sop.create({
    data: {
      titleEn: parsed.data.titleEn,
      titleId: parsed.data.titleId,
      descriptionEn: parsed.data.descriptionEn || null,
      descriptionId: parsed.data.descriptionId || null,
      category: parsed.data.category || null,
      steps: { create: parsed.data.steps.map((s, i) => ({ position: i, bodyEn: s.bodyEn, bodyId: s.bodyId })) },
    },
  });
  revalidatePath("/sops");
  return { ok: true, data: { id: sop.id } };
}

export async function updateSop(id: string, input: unknown): Promise<ActionResult> {
  const parsed = sopSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  await prisma.$transaction(async (tx: TransactionClient) => {
    await tx.sopStep.deleteMany({ where: { sopId: id } });
    await tx.sop.update({
      where: { id },
      data: {
        titleEn: parsed.data.titleEn,
        titleId: parsed.data.titleId,
        descriptionEn: parsed.data.descriptionEn || null,
        descriptionId: parsed.data.descriptionId || null,
        category: parsed.data.category || null,
        steps: { create: parsed.data.steps.map((s, i) => ({ position: i, bodyEn: s.bodyEn, bodyId: s.bodyId })) },
      },
    });
  });
  revalidatePath("/sops");
  revalidatePath(`/sops/${id}`);
  return { ok: true };
}

export async function setSopStatus(id: string, status: "ACTIVE" | "ARCHIVED"): Promise<ActionResult> {
  await prisma.sop.update({ where: { id }, data: { status } });
  revalidatePath("/sops");
  revalidatePath(`/sops/${id}`);
  return { ok: true };
}

export async function deleteSop(id: string): Promise<ActionResult> {
  await prisma.sop.delete({ where: { id } });
  revalidatePath("/sops");
  return { ok: true };
}

// ============================================================================
// Build an SOP from the booklet PDFs (EN and/or ID) — deterministic parse of
// the day-by-day table + page sections, no AI in the loop. Assign to a live
// cycle so the Tasks page shows "today's HST" instructions.
// ============================================================================

import { requireStaff } from "@/server/authz";
import { recordAction } from "@/server/audit";
import { extractDocumentText } from "@/server/doc-text";
import { saveFileUpload } from "@/server/uploads";
import { guessSopTitle, parseSopDays, parseSopPages } from "@/server/sop-parse";
import { formatSopInBackground } from "@/server/sop-format";

export async function buildSopFromPdfs(
  formData: FormData,
): Promise<ActionResult<{ id: string; days: number; sections: number }>> {
  const gate = await requireStaff();
  if (!gate.ok) return { ok: false, error: gate.error };
  const en = formData.get("en");
  const id = formData.get("id");
  const category = String(formData.get("category") ?? "").trim().slice(0, 60) || null;
  const hasEn = en instanceof File && en.size > 0;
  const hasId = id instanceof File && id.size > 0;
  if (!hasEn && !hasId) return { ok: false, error: "Upload at least one booklet (English and/or Indonesian PDF)" };

  try {
    const [enText, idText] = await Promise.all([
      hasEn ? extractDocumentText(en as File).then((r) => r.text) : Promise.resolve(null),
      hasId ? extractDocumentText(id as File).then((r) => r.text) : Promise.resolve(null),
    ]);
    const primary = (enText ?? idText) as string;
    const enDays = enText ? parseSopDays(enText) : [];
    const idDays = idText ? parseSopDays(idText) : [];
    const enPages = enText ? parseSopPages(enText) : [];
    const idPages = idText ? parseSopPages(idText) : [];

    // Merge days by HST — numbers from whichever book has the row; jobs per language,
    // falling back to the other language so a wrapped line doesn't blank a day.
    const dayNums = [...new Set([...enDays.map((d) => d.day), ...idDays.map((d) => d.day)])].sort((a, b) => a - b);
    const days = dayNums.map((n) => {
      const e = enDays.find((d) => d.day === n);
      const i = idDays.find((d) => d.day === n);
      const base = e ?? i!;
      return {
        day: n,
        stage: base.stage,
        ec: base.ec,
        ppm: base.ppm,
        sopPerTank: base.sopPerTank,
        waterMl: base.waterMl,
        pulses: base.pulses,
        times: base.times,
        jobEn: e?.job ?? i?.job ?? null,
        jobId: i?.job ?? e?.job ?? null,
      };
    });

    // Sections: pair pages by index. If one book is missing, both languages get
    // the same text (the toggle still works; upload the other book later).
    const n = Math.max(enPages.length, idPages.length);
    const steps: { bodyEn: string; bodyId: string }[] = [];
    for (let k = 0; k < n; k++) {
      const pe = enPages[k]?.body ?? idPages[k]?.body ?? "";
      const pi = idPages[k]?.body ?? enPages[k]?.body ?? "";
      if (!pe && !pi) continue;
      steps.push({ bodyEn: pe, bodyId: pi });
    }

    const titleEn = enText ? guessSopTitle(enText, (en as File).name) : guessSopTitle(primary, "SOP");
    const titleId = idText ? guessSopTitle(idText, (id as File).name) : titleEn;

    const [savedEn, savedId] = await Promise.all([
      hasEn ? saveFileUpload(en as File, "sops") : Promise.resolve(null),
      hasId ? saveFileUpload(id as File, "sops") : Promise.resolve(null),
    ]);

    let sopId = "";
    await prisma.$transaction(async (tx: TransactionClient) => {
      const sop = await tx.sop.create({
        data: {
          titleEn,
          titleId,
          descriptionEn: `Built from ${[hasEn ? "EN" : null, hasId ? "ID" : null].filter(Boolean).join(" + ")} booklet · ${days.length} scheduled days · ${steps.length} sections`,
          descriptionId: `Dibuat dari buku ${[hasEn ? "EN" : null, hasId ? "ID" : null].filter(Boolean).join(" + ")} · ${days.length} hari terjadwal · ${steps.length} bagian`,
          category,
          sourceEnPath: savedEn?.path ?? null,
          sourceIdPath: savedId?.path ?? null,
          steps: { create: steps.map((s, i) => ({ position: i + 1, bodyEn: s.bodyEn, bodyId: s.bodyId, rawEn: s.bodyEn, rawId: s.bodyId })) },
          days: { create: days },
          formatTotal: steps.length,
        },
        select: { id: true },
      });
      sopId = sop.id;
      await recordAction(tx, {
        type: "sop.build_from_pdf",
        entityType: "Sop",
        entityId: sop.id,
        description: `Built SOP "${titleEn}" from PDF (${days.length} days, ${steps.length} sections)`,
        userId: gate.userId,
        payload: { sopId: sop.id, days: days.length, sections: steps.length, en: !!savedEn, id: !!savedId },
      });
    });
    revalidatePath("/sops");
    // Make the pages read like the book — runs in the background; the SOP
    // page shows progress and swaps raw text for formatted pages as they land.
    void formatSopInBackground(sopId);
    return { ok: true, data: { id: sopId, days: days.length, sections: steps.length } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't build the SOP" };
  }
}

/** Re-run the AI page formatting for an SOP (e.g. after a chain/model change). */
export async function reformatSop(sopId: string): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate.ok) return { ok: false, error: gate.error };
  const sop = await prisma.sop.findFirst({ where: { id: sopId }, select: { id: true } });
  if (!sop) return { ok: false, error: "SOP not found" };
  void formatSopInBackground(sop.id);
  revalidatePath(`/sops/${sop.id}`);
  return { ok: true };
}

const assignSchema = z.object({
  sopId: z.string().min(1),
  harvestId: z.string().min(1),
  hst0: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the transplant date (HST 0)"),
});

/** Put an SOP on a live cycle. hst0 = transplant date; today's HST = today − hst0. */
export async function assignSopToHarvest(input: unknown): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  const d = parsed.data;
  const [sop, h] = await Promise.all([
    prisma.sop.findFirst({ where: { id: d.sopId }, select: { id: true, titleEn: true } }),
    prisma.harvest.findFirst({ where: { id: d.harvestId }, select: { id: true, name: true } }),
  ]);
  if (!sop) return { ok: false, error: "SOP not found" };
  if (!h) return { ok: false, error: "Cycle not found" };
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.harvestSop.upsert({
        where: { harvestId_sopId: { harvestId: d.harvestId, sopId: d.sopId } },
        create: { harvestId: d.harvestId, sopId: d.sopId, hst0: new Date(d.hst0) },
        update: { hst0: new Date(d.hst0) },
      });
      await recordAction(tx, {
        type: "sop.assign",
        entityType: "Harvest",
        entityId: d.harvestId,
        description: `SOP "${sop.titleEn}" assigned to ${h.name} (HST 0 = ${d.hst0})`,
        userId: gate.userId,
        payload: { sopId: d.sopId, harvestId: d.harvestId, hst0: d.hst0 },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
  revalidatePath(`/harvest/${d.harvestId}`);
  revalidatePath(`/sops/${d.sopId}`);
  revalidatePath("/tasks");
  return { ok: true };
}

export async function unassignSopFromHarvest(assignmentId: string): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate.ok) return { ok: false, error: gate.error };
  const row = await prisma.harvestSop.findFirst({ where: { id: assignmentId }, select: { id: true, harvestId: true, sopId: true } });
  if (!row) return { ok: false, error: "Not found" };
  await prisma.harvestSop.delete({ where: { id: row.id } });
  revalidatePath(`/harvest/${row.harvestId}`);
  revalidatePath(`/sops/${row.sopId}`);
  revalidatePath("/tasks");
  return { ok: true };
}

// ============================================================================
// Turn SOP days into Tasks — "queue the next N days" or back-fill done days.
// One task per HST day in the range: the day's job (or the routine feed line
// when there's no specific job), due on hst0 + day, tagged to the cycle.
// Idempotent per (assignment, day): a task whose title starts with the same
// "HST n —" prefix on that cycle is not duplicated.
// ============================================================================

const genSchema = z.object({
  assignmentId: z.string().min(1),
  fromDay: z.coerce.number().int().min(0),
  toDay: z.coerce.number().int().min(0),
  status: z.enum(["PENDING", "COMPLETED"]).default("PENDING"),
  assigneeStaffId: z.string().optional(),
  /** Free text appended to each task's notes (e.g. "Done by Erni & Wawan"). */
  note: z.string().max(200).optional(),
  /** Also create routine-day tasks (rows without a specific job). */
  includeRoutine: z.boolean().default(true),
});

export async function generateSopTasks(
  input: unknown,
): Promise<ActionResult<{ created: number; skipped: number }>> {
  const gate = await requireStaff();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = genSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  const d = parsed.data;
  if (d.toDay < d.fromDay) return { ok: false, error: "Range is backwards" };
  if (d.toDay - d.fromDay > 90) return { ok: false, error: "Max 90 days at a time" };

  const a = (await prisma.harvestSop.findFirst({
    where: { id: d.assignmentId },
    select: {
      id: true,
      hst0: true,
      harvest: { select: { id: true, name: true, greenhouse: { select: { name: true } } } },
      sop: { select: { id: true, titleEn: true, days: { where: { day: { gte: d.fromDay, lte: d.toDay } }, orderBy: { day: "asc" } } } },
    },
  })) as {
    id: string;
    hst0: Date;
    harvest: { id: string; name: string; greenhouse: { name: string } };
    sop: {
      id: string;
      titleEn: string;
      days: { day: number; stage: string | null; ec: number | null; ppm: number | null; sopPerTank: string | null; waterMl: number | null; pulses: string | null; times: string | null; jobEn: string | null; jobId: string | null }[];
    };
  } | null;
  if (!a) return { ok: false, error: "SOP assignment not found" };

  const existing = (await prisma.task.findMany({
    where: { harvestId: a.harvest.id, title: { startsWith: "HST " } },
    select: { title: true },
  })) as { title: string }[];
  const have = new Set(existing.map((t) => t.title.split(" — ")[0]));

  const hst0 = a.hst0.toISOString().slice(0, 10);
  const due = (n: number) => {
    const t = new Date(hst0 + "T00:00:00Z");
    t.setUTCDate(t.getUTCDate() + n);
    return t;
  };

  let created = 0;
  let skipped = 0;
  await prisma.$transaction(async (tx: TransactionClient) => {
    for (const row of a.sop.days) {
      const key = `HST ${row.day}`;
      if (have.has(key)) {
        skipped++;
        continue;
      }
      const job = row.jobEn ?? row.jobId ?? null;
      if (!job && !d.includeRoutine) {
        skipped++;
        continue;
      }
      const feed = [
        row.stage ? `${row.stage}` : null,
        row.ec != null ? `EC ${row.ec} µS${row.ppm ? ` (${row.ppm} ppm)` : ""}` : null,
        row.waterMl != null ? `${row.waterMl} mL/polybag` : null,
        row.pulses ? `${row.pulses}${row.times ? ` @ ${row.times}` : ""}` : null,
        row.sopPerTank ? `SOP ${row.sopPerTank}/tank` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const title = job ? `${key} — ${job}` : `${key} — Routine feed & water (${row.stage ?? "SOP"})`;
      const instructions = [
        row.jobEn ? `EN: ${row.jobEn}` : null,
        row.jobId ? `ID: ${row.jobId}` : null,
        feed ? `Feed today: ${feed}` : null,
        `From SOP "${a.sop.titleEn}" · ${a.harvest.greenhouse.name} · HST 0 = ${hst0}`,
      ]
        .filter(Boolean)
        .join("\n");
      await tx.task.create({
        data: {
          title: title.slice(0, 200),
          description: feed || null,
          instructions,
          notes: d.note?.trim() || null,
          dueDate: due(row.day),
          priority: job ? "HIGH" : "MEDIUM",
          status: d.status,
          harvestId: a.harvest.id,
          assigneeStaffId: d.assigneeStaffId || null,
        },
      });
      created++;
    }
    await recordAction(tx, {
      type: "sop.generate_tasks",
      entityType: "Harvest",
      entityId: a.harvest.id,
      description: `Generated ${created} SOP tasks (HST ${d.fromDay}–${d.toDay}, ${d.status.toLowerCase()})`,
      userId: gate.userId,
      payload: { assignmentId: a.id, fromDay: d.fromDay, toDay: d.toDay, status: d.status, created, skipped },
    });
  });
  revalidatePath("/tasks");
  revalidatePath(`/harvest/${a.harvest.id}`);
  return { ok: true, data: { created, skipped } };
}
