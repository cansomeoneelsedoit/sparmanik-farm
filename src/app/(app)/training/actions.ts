"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { recordAction } from "@/server/audit";
import { requireSuperuser } from "@/server/authz";
import type { InputJsonValue, TransactionClient } from "@/server/decimal";
import { ask } from "@/server/ai-chain";
import { extractJson } from "@/server/json-extract";
import { markAnswers, type QuestionForMarking } from "@/server/training";
import { isEnrolledOrFree } from "@/server/enrollment";
import { removeScormPackage } from "@/server/scorm";
import { latestAttemptsByModule } from "@/app/(app)/training/progress";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/** Revalidate the training list + module library, plus a course's player + builder pages. */
function revalidateTraining(courseId?: string) {
  revalidatePath("/training");
  revalidatePath("/training/modules");
  if (courseId) {
    revalidatePath(`/training/${courseId}`);
    revalidatePath(`/training/${courseId}/edit`);
  }
}

/**
 * A module can sit in MANY courses — after editing it (or its questions),
 * every course that uses it must re-render, not just the one the editor
 * happened to be opened from.
 */
async function revalidateModuleCourses(moduleId: string) {
  const joins = (await prisma.courseModule.findMany({
    where: { moduleId },
    select: { courseId: true },
  })) as { courseId: string }[];
  revalidateTraining();
  for (const j of joins) {
    revalidatePath(`/training/${j.courseId}`);
    revalidatePath(`/training/${j.courseId}/edit`);
  }
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Same sharp pipeline as the item-photo uploads (rotate → resize inside →
 * WebP), sized for inline teaching pictures: max 1200 px, quality 80. The
 * bytes go straight into the row's `imageData` column — no filesystem, so
 * the picture travels with the row during local→prod sync.
 */
async function processTrainingImage(file: File): Promise<{ data: Buffer; mime: string }> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`File too large (max ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`);
  }
  const input = Buffer.from(await file.arrayBuffer());
  const data = await sharp(input)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  return { data, mime: "image/webp" };
}

// ---------------------------------------------------------------------------
// Courses (superuser)
// ---------------------------------------------------------------------------

const courseSchema = z.object({
  titleEn: z.string().trim().min(1, "English title is required"),
  titleId: z.string().trim().min(1, "Indonesian title is required"),
  description: z.string().optional().nullable(),
});

const courseUpdateSchema = courseSchema.extend({
  published: z.boolean().optional(),
  /** Whole-Rupiah price as a digit string ("150000"), or null = free. Omitted
   *  entirely → the stored price is left untouched (existing callers like the
   *  course builder don't send it). */
  priceIdr: z
    .string()
    .trim()
    .regex(/^\d+$/, "Price must be a whole number of Rupiah")
    .nullable()
    .optional(),
});

export async function createCourse(input: unknown): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const parsed = courseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  try {
    const course = await prisma.$transaction(async (tx: TransactionClient) => {
      const c = await tx.course.create({
        data: {
          titleEn: parsed.data.titleEn,
          titleId: parsed.data.titleId,
          description: parsed.data.description || null,
        },
      });
      await recordAction(tx, {
        type: "training.course.create",
        entityType: "Course",
        entityId: c.id,
        description: `Created course "${parsed.data.titleEn}"`,
        userId: gate.userId,
      });
      return c;
    });
    revalidateTraining(course.id);
    return { ok: true, data: { id: course.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create course" };
  }
}

export async function updateCourse(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const parsed = courseUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const existing = await prisma.course.findFirst({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: "Course not found" };
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.course.update({
        where: { id },
        data: {
          titleEn: parsed.data.titleEn,
          titleId: parsed.data.titleId,
          description: parsed.data.description || null,
          ...(parsed.data.published === undefined ? {} : { published: parsed.data.published }),
          // Prisma accepts the digit string directly for the Decimal column.
          ...(parsed.data.priceIdr === undefined ? {} : { priceIdr: parsed.data.priceIdr }),
        },
      });
      await recordAction(tx, {
        type: "training.course.update",
        entityType: "Course",
        entityId: id,
        description: `Edited course "${parsed.data.titleEn}"`,
        userId: gate.userId,
        payload: { published: parsed.data.published, priceIdr: parsed.data.priceIdr },
      });
    });
    revalidateTraining(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save this course" };
  }
}

export async function deleteCourse(id: string): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const existing = (await prisma.course.findFirst({
    where: { id },
    select: { id: true, titleEn: true },
  })) as { id: string; titleEn: string } | null;
  if (!existing) return { ok: false, error: "Course not found" };
  try {
    // Cascade only removes the CourseModule JOIN rows — the modules themselves
    // (with their questions and attempts) stay in the library for reuse.
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.course.delete({ where: { id } });
      await recordAction(tx, {
        type: "training.course.delete",
        entityType: "Course",
        entityId: id,
        description: `Deleted course "${existing.titleEn}"`,
        userId: gate.userId,
      });
    });
    revalidateTraining(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't delete this course" };
  }
}

// ---------------------------------------------------------------------------
// Modules (superuser) — the LIBRARY. A module can be in many courses or none.
// ---------------------------------------------------------------------------

const moduleFieldsBase = z.object({
  titleEn: z.string().trim().optional().nullable(),
  titleId: z.string().trim().optional().nullable(),
  videoId: z.string().optional().nullable(),
  bodyEn: z.string().optional().nullable(),
  bodyId: z.string().optional().nullable(),
  passPct: z.number().int().min(0).max(100).optional(),
});

/** At least one title (either language) — the missing one is auto-translated. */
const hasATitle = (d: { titleEn?: string | null; titleId?: string | null }) =>
  !!(d.titleEn?.trim() || d.titleId?.trim());

const moduleFieldsSchema = moduleFieldsBase.refine(hasATitle, {
  message: "A title is required (English or Indonesian)",
});

const createModuleSchema = moduleFieldsBase
  .extend({ courseId: z.string().min(1).optional() })
  .refine(hasATitle, { message: "A title is required (English or Indonesian)" });

type BilingualContent = { titleEn: string; titleId: string; bodyEn: string | null; bodyId: string | null };

/**
 * Fill whichever language's title/body is blank by AI-translating from the
 * other language — a SINGLE ask() per save covering every missing field
 * (json mode, same chain as the item-name translator). A field only counts
 * as missing when its counterpart language has text. On any AI failure the
 * source text is copied verbatim instead: the save must never block on AI.
 */
async function fillMissingTranslations(input: {
  titleEn?: string | null;
  titleId?: string | null;
  bodyEn?: string | null;
  bodyId?: string | null;
}): Promise<BilingualContent> {
  const out = {
    titleEn: input.titleEn?.trim() ?? "",
    titleId: input.titleId?.trim() ?? "",
    bodyEn: input.bodyEn?.trim() ?? "",
    bodyId: input.bodyId?.trim() ?? "",
  };
  type Key = keyof typeof out;
  const wants: { key: Key; source: string; to: "Indonesian" | "English"; what: string }[] = [];
  if (!out.titleId && out.titleEn) wants.push({ key: "titleId", source: out.titleEn, to: "Indonesian", what: "title" });
  if (!out.titleEn && out.titleId) wants.push({ key: "titleEn", source: out.titleId, to: "English", what: "title" });
  if (!out.bodyId && out.bodyEn) wants.push({ key: "bodyId", source: out.bodyEn, to: "Indonesian", what: "teaching text" });
  if (!out.bodyEn && out.bodyId) wants.push({ key: "bodyEn", source: out.bodyId, to: "English", what: "teaching text" });

  if (wants.length > 0) {
    // Fallback first — copying the source text means an AI outage degrades to
    // "same text in both languages", never a lost save.
    for (const w of wants) out[w.key] = w.source;
    try {
      const fields = wants
        .map((w) => `"${w.key}" — translate this ${w.what} to ${w.to}:\n---\n${w.source}\n---`)
        .join("\n\n");
      const prompt = `You translate training content for an Indonesian hydroponic melon farm (English ↔ Indonesian).
Translate naturally for farm staff. Keep numbers, units, chemical/product names and formatting unchanged.

${fields}

Reply with ONLY JSON: {${wants.map((w) => `"${w.key}": "..."`).join(", ")}}`;
      const raw = await ask({ prompt, json: true, maxTokens: 2000, disableThinking: true });
      const parsed = extractJson<Record<string, unknown>>(raw);
      for (const w of wants) {
        const v = parsed[w.key];
        if (typeof v === "string" && v.trim()) out[w.key] = v.trim();
      }
    } catch {
      // Keep the verbatim copies set above.
    }
  }
  return {
    titleEn: out.titleEn,
    titleId: out.titleId,
    bodyEn: out.bodyEn || null,
    bodyId: out.bodyId || null,
  };
}

/** Org-scoped existence check — foreign-org ids come back null. */
async function findVideo(videoId: string): Promise<boolean> {
  const v = await prisma.video.findFirst({ where: { id: videoId }, select: { id: true } });
  return !!v;
}

export async function createModule(input: unknown): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const parsed = createModuleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const d = parsed.data;
  if (d.courseId) {
    const course = await prisma.course.findFirst({ where: { id: d.courseId }, select: { id: true } });
    if (!course) return { ok: false, error: "Course not found" };
  }
  if (d.videoId && !(await findVideo(d.videoId))) return { ok: false, error: "Video not found" };
  const content = await fillMissingTranslations(d);
  try {
    const created = await prisma.$transaction(async (tx: TransactionClient) => {
      const m = await tx.module.create({
        data: {
          titleEn: content.titleEn,
          titleId: content.titleId,
          videoId: d.videoId || null,
          bodyEn: content.bodyEn,
          bodyId: content.bodyId,
          passPct: d.passPct ?? 80,
        },
      });
      if (d.courseId) {
        const last = await tx.courseModule.aggregate({
          where: { courseId: d.courseId },
          _max: { rank: true },
        });
        await tx.courseModule.create({
          data: { courseId: d.courseId, moduleId: m.id, rank: (last._max.rank ?? 0) + 1 },
        });
      }
      await recordAction(tx, {
        type: "training.module.create",
        entityType: "Module",
        entityId: m.id,
        description: `Created module "${content.titleEn}"`,
        userId: gate.userId,
        payload: d.courseId ? { courseId: d.courseId } : undefined,
      });
      return m;
    });
    revalidateTraining(d.courseId);
    return { ok: true, data: { id: created.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create module" };
  }
}

export async function updateModule(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const parsed = moduleFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const d = parsed.data;
  const existing = (await prisma.module.findFirst({
    where: { id },
    select: { id: true },
  })) as { id: string } | null;
  if (!existing) return { ok: false, error: "Module not found" };
  if (d.videoId && !(await findVideo(d.videoId))) return { ok: false, error: "Video not found" };
  const content = await fillMissingTranslations(d);
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.module.update({
        where: { id },
        data: {
          titleEn: content.titleEn,
          titleId: content.titleId,
          videoId: d.videoId || null,
          bodyEn: content.bodyEn,
          bodyId: content.bodyId,
          ...(d.passPct === undefined ? {} : { passPct: d.passPct }),
        },
      });
      await recordAction(tx, {
        type: "training.module.update",
        entityType: "Module",
        entityId: id,
        description: `Edited module "${content.titleEn}"`,
        userId: gate.userId,
      });
    });
    await revalidateModuleCourses(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save this module" };
  }
}

/**
 * Delete a module from the LIBRARY. Cascade removes its course joins, its
 * questions AND every staff attempt — the confirm copy in the UI spells out
 * that this affects every course using the module.
 */
export async function deleteModule(id: string): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const existing = (await prisma.module.findFirst({
    where: { id },
    select: { id: true, titleEn: true, scormPath: true },
  })) as { id: string; titleEn: string; scormPath: string | null } | null;
  if (!existing) return { ok: false, error: "Module not found" };
  // Capture the affected courses BEFORE the joins cascade away.
  const joins = (await prisma.courseModule.findMany({
    where: { moduleId: id },
    select: { courseId: true },
  })) as { courseId: string }[];
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.module.delete({ where: { id } });
      await recordAction(tx, {
        type: "training.module.delete",
        entityType: "Module",
        entityId: id,
        description: `Deleted module "${existing.titleEn}" from the library`,
        userId: gate.userId,
        payload: { courseIds: joins.map((j) => j.courseId) },
      });
    });
    // DB row is gone — now clean the extracted SCORM package off the uploads
    // volume. Best-effort: the delete already committed, so an fs error must
    // not flip the result to a failure (it would just leave an orphan dir).
    if (existing.scormPath) {
      try {
        await removeScormPackage(id);
      } catch {
        /* orphaned dir — harmless, swept later if ever needed */
      }
    }
    revalidateTraining();
    for (const j of joins) {
      revalidatePath(`/training/${j.courseId}`);
      revalidatePath(`/training/${j.courseId}/edit`);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't delete this module" };
  }
}

export async function setModuleImage(id: string, formData: FormData): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };
  const mod = (await prisma.module.findFirst({
    where: { id },
    select: { id: true },
  })) as { id: string } | null;
  if (!mod) return { ok: false, error: "Module not found" };
  try {
    const img = await processTrainingImage(file);
    await prisma.$transaction(async (tx: TransactionClient) => {
      // Node Buffer extends Uint8Array, but Prisma 6's generated types want
      // a strict Uint8Array<ArrayBuffer>. Wrap explicitly (same as Item.photoData).
      await tx.module.update({
        where: { id },
        data: { imageData: new Uint8Array(img.data), imageMime: img.mime },
      });
      await recordAction(tx, {
        type: "training.module.image",
        entityType: "Module",
        entityId: id,
        description: "Updated module image",
        userId: gate.userId,
      });
    });
    await revalidateModuleCourses(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Image upload failed" };
  }
}

export async function clearModuleImage(id: string): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const mod = (await prisma.module.findFirst({
    where: { id },
    select: { id: true },
  })) as { id: string } | null;
  if (!mod) return { ok: false, error: "Module not found" };
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.module.update({ where: { id }, data: { imageData: null, imageMime: null } });
      await recordAction(tx, {
        type: "training.module.image",
        entityType: "Module",
        entityId: id,
        description: "Removed module image",
        userId: gate.userId,
      });
    });
    await revalidateModuleCourses(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't remove the image" };
  }
}

// ---------------------------------------------------------------------------
// Course composition (superuser) — the CourseModule join rows
// ---------------------------------------------------------------------------

/** Put an existing library module at the END of a course. */
export async function addModuleToCourse(courseId: string, moduleId: string): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const course = (await prisma.course.findFirst({
    where: { id: courseId },
    select: { id: true, titleEn: true },
  })) as { id: string; titleEn: string } | null;
  if (!course) return { ok: false, error: "Course not found" };
  const mod = (await prisma.module.findFirst({
    where: { id: moduleId },
    select: { id: true, titleEn: true },
  })) as { id: string; titleEn: string } | null;
  if (!mod) return { ok: false, error: "Module not found" };
  const dup = await prisma.courseModule.findFirst({
    where: { courseId, moduleId },
    select: { id: true },
  });
  if (dup) return { ok: false, error: "That module is already in this course" };
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      const last = await tx.courseModule.aggregate({ where: { courseId }, _max: { rank: true } });
      const join = await tx.courseModule.create({
        data: { courseId, moduleId, rank: (last._max.rank ?? 0) + 1 },
      });
      await recordAction(tx, {
        type: "training.course.add_module",
        entityType: "CourseModule",
        entityId: join.id,
        description: `Added module "${mod.titleEn}" to course "${course.titleEn}"`,
        userId: gate.userId,
        payload: { courseId, moduleId },
      });
    });
    revalidateTraining(courseId);
    return { ok: true };
  } catch (e) {
    // The @@unique([courseId, moduleId]) also guards a double-click race.
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't add the module" };
  }
}

/** Remove the JOIN only — the module stays in the library (and other courses). */
export async function removeModuleFromCourse(
  courseId: string,
  moduleId: string,
): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const join = (await prisma.courseModule.findFirst({
    where: { courseId, moduleId },
    select: { id: true, module: { select: { titleEn: true } }, course: { select: { titleEn: true } } },
  })) as { id: string; module: { titleEn: string }; course: { titleEn: string } } | null;
  if (!join) return { ok: false, error: "Module is not in this course" };
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.courseModule.delete({ where: { id: join.id } });
      await recordAction(tx, {
        type: "training.course.remove_module",
        entityType: "CourseModule",
        entityId: join.id,
        description: `Removed module "${join.module.titleEn}" from course "${join.course.titleEn}"`,
        userId: gate.userId,
        payload: { courseId, moduleId },
      });
    });
    revalidateTraining(courseId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't remove the module" };
  }
}

export async function moveModuleInCourse(
  courseId: string,
  moduleId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  // Swap rank with the immediate neighbour join (same pattern as reorderAiKey).
  const all = (await prisma.courseModule.findMany({
    where: { courseId },
    orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
    select: { id: true, moduleId: true, rank: true },
  })) as { id: string; moduleId: string; rank: number }[];
  const idx = all.findIndex((r) => r.moduleId === moduleId);
  if (idx === -1) return { ok: false, error: "Module is not in this course" };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) return { ok: true };
  const here = all[idx];
  const there = all[swapIdx];
  await prisma.$transaction([
    prisma.courseModule.update({ where: { id: here.id }, data: { rank: there.rank } }),
    prisma.courseModule.update({ where: { id: there.id }, data: { rank: here.rank } }),
  ]);
  revalidateTraining(courseId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Questions (superuser)
// ---------------------------------------------------------------------------

const questionTypeSchema = z.enum(["MULTIPLE_CHOICE", "FILL_BLANK", "ORDER", "PHOTO_SPOT"]);

const localizedTextSchema = z.object({
  en: z.string().trim().min(1, "English text is required"),
  id: z.string().trim().min(1, "Indonesian text is required"),
});

/** MULTIPLE_CHOICE / PHOTO_SPOT: { options, correct } */
const choiceConfigSchema = z
  .object({
    options: z.array(localizedTextSchema).min(2, "At least 2 options").max(8, "At most 8 options"),
    correct: z.array(z.number().int().min(0)).min(1, "Mark at least one correct option"),
  })
  .refine(
    (c) =>
      c.correct.every((i) => i < c.options.length) &&
      new Set(c.correct).size === c.correct.length,
    { message: "Correct answers must be unique option indexes" },
  );

/** FILL_BLANK: { accept } */
const fillConfigSchema = z.object({
  accept: z
    .array(z.string().trim().min(1, "Accepted answers can't be empty"))
    .min(1, "At least 1 accepted answer")
    .max(10, "At most 10 accepted answers"),
});

/** ORDER: { items } — config order IS the correct order. */
const orderConfigSchema = z.object({
  items: z.array(localizedTextSchema).min(2, "At least 2 items").max(8, "At most 8 items"),
});

function parseQuestionConfig(
  type: z.infer<typeof questionTypeSchema>,
  config: unknown,
): { ok: true; config: InputJsonValue } | { ok: false; error: string } {
  const schema =
    type === "FILL_BLANK"
      ? fillConfigSchema
      : type === "ORDER"
        ? orderConfigSchema
        : choiceConfigSchema;
  const parsed = schema.safeParse(config);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid question config" };
  }
  return { ok: true, config: parsed.data as InputJsonValue };
}

const createQuestionSchema = z.object({
  moduleId: z.string().min(1),
  type: questionTypeSchema,
  promptEn: z.string().trim().min(1, "English prompt is required"),
  promptId: z.string().trim().min(1, "Indonesian prompt is required"),
  config: z.unknown(),
});

export async function createQuestion(input: unknown): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const parsed = createQuestionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const d = parsed.data;
  const cfg = parseQuestionConfig(d.type, d.config);
  if (!cfg.ok) return cfg;
  const mod = (await prisma.module.findFirst({
    where: { id: d.moduleId },
    select: { id: true },
  })) as { id: string } | null;
  if (!mod) return { ok: false, error: "Module not found" };
  try {
    const question = await prisma.$transaction(async (tx: TransactionClient) => {
      const last = await tx.question.aggregate({ where: { moduleId: d.moduleId }, _max: { rank: true } });
      const q = await tx.question.create({
        data: {
          moduleId: d.moduleId,
          rank: (last._max.rank ?? 0) + 1,
          type: d.type,
          promptEn: d.promptEn,
          promptId: d.promptId,
          config: cfg.config,
        },
      });
      await recordAction(tx, {
        type: "training.question.create",
        entityType: "Question",
        entityId: q.id,
        description: `Added a ${d.type.toLowerCase().replace("_", " ")} question`,
        userId: gate.userId,
        payload: { moduleId: d.moduleId },
      });
      return q;
    });
    await revalidateModuleCourses(d.moduleId);
    return { ok: true, data: { id: question.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create question" };
  }
}

const updateQuestionSchema = z.object({
  promptEn: z.string().trim().min(1, "English prompt is required"),
  promptId: z.string().trim().min(1, "Indonesian prompt is required"),
  config: z.unknown(),
});

export async function updateQuestion(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const parsed = updateQuestionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const existing = (await prisma.question.findFirst({
    where: { id },
    select: { id: true, type: true, moduleId: true },
  })) as { id: string; type: z.infer<typeof questionTypeSchema>; moduleId: string } | null;
  if (!existing) return { ok: false, error: "Question not found" };
  // The type is immutable after creation — validate against the stored type.
  const cfg = parseQuestionConfig(existing.type, parsed.data.config);
  if (!cfg.ok) return cfg;
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.question.update({
        where: { id },
        data: { promptEn: parsed.data.promptEn, promptId: parsed.data.promptId, config: cfg.config },
      });
      await recordAction(tx, {
        type: "training.question.update",
        entityType: "Question",
        entityId: id,
        description: "Edited a question",
        userId: gate.userId,
      });
    });
    await revalidateModuleCourses(existing.moduleId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save this question" };
  }
}

export async function deleteQuestion(id: string): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const existing = (await prisma.question.findFirst({
    where: { id },
    select: { id: true, moduleId: true },
  })) as { id: string; moduleId: string } | null;
  if (!existing) return { ok: false, error: "Question not found" };
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.question.delete({ where: { id } });
      await recordAction(tx, {
        type: "training.question.delete",
        entityType: "Question",
        entityId: id,
        description: "Deleted a question",
        userId: gate.userId,
        payload: { moduleId: existing.moduleId },
      });
    });
    await revalidateModuleCourses(existing.moduleId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't delete this question" };
  }
}

export async function moveQuestion(id: string, direction: "up" | "down"): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const question = (await prisma.question.findFirst({
    where: { id },
    select: { id: true, moduleId: true },
  })) as { id: string; moduleId: string } | null;
  if (!question) return { ok: false, error: "Question not found" };
  const all = (await prisma.question.findMany({
    where: { moduleId: question.moduleId },
    orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
    select: { id: true, rank: true },
  })) as { id: string; rank: number }[];
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return { ok: false, error: "Question not found" };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) return { ok: true };
  const here = all[idx];
  const there = all[swapIdx];
  await prisma.$transaction([
    prisma.question.update({ where: { id: here.id }, data: { rank: there.rank } }),
    prisma.question.update({ where: { id: there.id }, data: { rank: here.rank } }),
  ]);
  await revalidateModuleCourses(question.moduleId);
  return { ok: true };
}

export async function setQuestionImage(id: string, formData: FormData): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };
  const question = (await prisma.question.findFirst({
    where: { id },
    select: { id: true, moduleId: true },
  })) as { id: string; moduleId: string } | null;
  if (!question) return { ok: false, error: "Question not found" };
  try {
    const img = await processTrainingImage(file);
    await prisma.$transaction(async (tx: TransactionClient) => {
      // Buffer → strict Uint8Array for Prisma 6's Bytes type (see setModuleImage).
      await tx.question.update({
        where: { id },
        data: { imageData: new Uint8Array(img.data), imageMime: img.mime },
      });
      await recordAction(tx, {
        type: "training.question.image",
        entityType: "Question",
        entityId: id,
        description: "Updated question image",
        userId: gate.userId,
      });
    });
    await revalidateModuleCourses(question.moduleId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Image upload failed" };
  }
}

export async function clearQuestionImage(id: string): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const question = (await prisma.question.findFirst({
    where: { id },
    select: { id: true, moduleId: true },
  })) as { id: string; moduleId: string } | null;
  if (!question) return { ok: false, error: "Question not found" };
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.question.update({ where: { id }, data: { imageData: null, imageMime: null } });
      await recordAction(tx, {
        type: "training.question.image",
        entityType: "Question",
        entityId: id,
        description: "Removed question image",
        userId: gate.userId,
      });
    });
    await revalidateModuleCourses(question.moduleId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't remove the image" };
  }
}

// ---------------------------------------------------------------------------
// Player-facing (any signed-in user)
// ---------------------------------------------------------------------------

const submitAttemptSchema = z.object({
  courseId: z.string().min(1),
  moduleId: z.string().min(1),
  answers: z.record(z.unknown()),
});

/**
 * Mark a module attempt SERVER-side (the client never sees the correct
 * answers — see src/server/training.ts) and record it. No superuser gate:
 * every signed-in staff member takes modules.
 *
 * The course rules are enforced HERE, not just in the page render (a server
 * action is a plain POST endpoint — review finding: without these checks a
 * staff member could submit attempts for locked/draft modules directly and
 * forge course progress). The CourseModule JOIN row is the source of truth:
 *   - it must exist (the module is actually in the course being taken, which
 *     also proves the module is reachable through at least one course)
 *   - that course must be published (non-superusers)
 *   - within THAT course, every earlier-ranked module's latest attempt must
 *     have passed
 * A module with NO questions is a content-only module: submitting marks it
 * complete at 100% (otherwise it could never pass and would permanently lock
 * everything after it).
 */
export async function submitModuleAttempt(
  input: unknown,
): Promise<ActionResult<{ score: number; passed: boolean; perQuestion: Record<string, boolean> }>> {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return { ok: false, error: "Not signed in" };
  const isSuperuser = (session.user as { role?: string }).role === "SUPERUSER";
  const parsed = submitAttemptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const join = (await prisma.courseModule.findFirst({
    where: { courseId: parsed.data.courseId, moduleId: parsed.data.moduleId },
    select: {
      rank: true,
      course: { select: { id: true, published: true } },
      module: {
        select: {
          id: true,
          passPct: true,
          scormPath: true,
          questions: {
            orderBy: { rank: "asc" },
            select: { id: true, type: true, config: true },
          },
        },
      },
    },
  })) as {
    rank: number;
    course: { id: string; published: boolean };
    module: { id: string; passPct: number; scormPath: string | null; questions: QuestionForMarking[] };
  } | null;
  if (!join) return { ok: false, error: "Module not found" };
  // A SCORM module has zero questions — it would hit the content-only branch
  // below and auto-pass at 100%. Its completion MUST come from the SCO via
  // recordScormCompletion; refuse this quiz endpoint for it (mirror of the
  // guard in scorm-actions.ts). Otherwise a learner could POST an empty
  // attempt and skip the SCO entirely.
  if (join.module.scormPath) return { ok: false, error: "Module not found" };

  if (!isSuperuser) {
    if (!join.course.published) return { ok: false, error: "Module not found" };
    // Same lock the player page enforces: all earlier-ranked modules' LATEST
    // attempts (in the course being taken) must have passed.
    const earlier = (await prisma.courseModule.findMany({
      where: { courseId: join.course.id, rank: { lt: join.rank } },
      select: { moduleId: true },
    })) as { moduleId: string }[];
    if (earlier.length > 0) {
      const latest = await latestAttemptsByModule(uid, earlier.map((e) => e.moduleId));
      const allPassed = earlier.every((e) => latest.get(e.moduleId)?.passed);
      if (!allPassed) return { ok: false, error: "Finish the earlier modules first." };
    }
    // Priced course → an enrollment (paid or granted) is required. Enforced
    // HERE, not just in the page render, for the same reason as the checks
    // above: a server action is a plain POST endpoint.
    const enrolled = await isEnrolledOrFree(join.course.id, uid, session.user.role);
    if (!enrolled) return { ok: false, error: "Enroll in this course first." };
  }

  // Content-only module (no questions): completing it = viewing it.
  const result =
    join.module.questions.length === 0
      ? { score: 100, passed: true, perQuestion: {} as Record<string, boolean> }
      : markAnswers(join.module.questions, parsed.data.answers, join.module.passPct);
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      const attempt = await tx.moduleAttempt.create({
        data: {
          moduleId: join.module.id,
          userId: uid,
          score: result.score,
          passed: result.passed,
          answers: parsed.data.answers as InputJsonValue,
        },
      });
      await recordAction(tx, {
        type: "training.attempt",
        entityType: "ModuleAttempt",
        entityId: attempt.id,
        description: `Module attempt ${result.score}%`,
        userId: uid,
        payload: {
          moduleId: join.module.id,
          courseId: join.course.id,
          score: result.score,
          passed: result.passed,
        },
      });
    });
    revalidateTraining(join.course.id);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save the attempt" };
  }
}

// ---------------------------------------------------------------------------
// Course cover image — shown as the course's thumbnail on the Training
// dashboard and as the hero banner when opened. Absent → the generated
// gradient cover (src/lib/cover-art.ts).
// ---------------------------------------------------------------------------

export async function setCourseImage(id: string, formData: FormData): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pick an image file." };
  const existing = await prisma.course.findFirst({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: "Course not found" };
  try {
    const { data, mime } = await processTrainingImage(file);
    await prisma.course.update({
      where: { id },
      data: { imageData: new Uint8Array(data), imageMime: mime },
    });
    revalidateTraining(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save the image" };
  }
}

export async function clearCourseImage(id: string): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const existing = await prisma.course.findFirst({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: "Course not found" };
  await prisma.course.update({ where: { id }, data: { imageData: null, imageMime: null } });
  revalidateTraining(id);
  return { ok: true };
}
