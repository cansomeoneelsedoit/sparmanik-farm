"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import { recordAction } from "@/server/audit";
import { requireSuperuser } from "@/server/authz";
import type { InputJsonValue, TransactionClient } from "@/server/decimal";
import { markAnswers, type QuestionForMarking } from "@/server/training";
import { latestAttemptsByLesson } from "@/app/(app)/training/progress";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/** Revalidate the training list plus a course's player + builder pages. */
function revalidateTraining(courseId?: string) {
  revalidatePath("/training");
  if (courseId) {
    revalidatePath(`/training/${courseId}`);
    revalidatePath(`/training/${courseId}/edit`);
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
        },
      });
      await recordAction(tx, {
        type: "training.course.update",
        entityType: "Course",
        entityId: id,
        description: `Edited course "${parsed.data.titleEn}"`,
        userId: gate.userId,
        payload: { published: parsed.data.published },
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
    // Cascade deletes lessons → questions → attempts (schema onDelete: Cascade).
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
// Lessons (superuser)
// ---------------------------------------------------------------------------

const lessonFieldsSchema = z.object({
  titleEn: z.string().trim().min(1, "English title is required"),
  titleId: z.string().trim().min(1, "Indonesian title is required"),
  videoId: z.string().optional().nullable(),
  bodyEn: z.string().optional().nullable(),
  bodyId: z.string().optional().nullable(),
  passPct: z.number().int().min(0).max(100).optional(),
});

const createLessonSchema = lessonFieldsSchema.extend({
  courseId: z.string().min(1),
});

/** Org-scoped existence check — foreign-org ids come back null. */
async function findVideo(videoId: string): Promise<boolean> {
  const v = await prisma.video.findFirst({ where: { id: videoId }, select: { id: true } });
  return !!v;
}

export async function createLesson(input: unknown): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const parsed = createLessonSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const d = parsed.data;
  const course = await prisma.course.findFirst({ where: { id: d.courseId }, select: { id: true } });
  if (!course) return { ok: false, error: "Course not found" };
  if (d.videoId && !(await findVideo(d.videoId))) return { ok: false, error: "Video not found" };
  try {
    const lesson = await prisma.$transaction(async (tx: TransactionClient) => {
      const last = await tx.lesson.aggregate({ where: { courseId: d.courseId }, _max: { rank: true } });
      const l = await tx.lesson.create({
        data: {
          courseId: d.courseId,
          rank: (last._max.rank ?? 0) + 1,
          titleEn: d.titleEn,
          titleId: d.titleId,
          videoId: d.videoId || null,
          bodyEn: d.bodyEn || null,
          bodyId: d.bodyId || null,
          passPct: d.passPct ?? 80,
        },
      });
      await recordAction(tx, {
        type: "training.lesson.create",
        entityType: "Lesson",
        entityId: l.id,
        description: `Added lesson "${d.titleEn}"`,
        userId: gate.userId,
        payload: { courseId: d.courseId },
      });
      return l;
    });
    revalidateTraining(d.courseId);
    return { ok: true, data: { id: lesson.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create lesson" };
  }
}

export async function updateLesson(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const parsed = lessonFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const d = parsed.data;
  const existing = (await prisma.lesson.findFirst({
    where: { id },
    select: { id: true, courseId: true },
  })) as { id: string; courseId: string } | null;
  if (!existing) return { ok: false, error: "Lesson not found" };
  if (d.videoId && !(await findVideo(d.videoId))) return { ok: false, error: "Video not found" };
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.lesson.update({
        where: { id },
        data: {
          titleEn: d.titleEn,
          titleId: d.titleId,
          videoId: d.videoId || null,
          bodyEn: d.bodyEn || null,
          bodyId: d.bodyId || null,
          ...(d.passPct === undefined ? {} : { passPct: d.passPct }),
        },
      });
      await recordAction(tx, {
        type: "training.lesson.update",
        entityType: "Lesson",
        entityId: id,
        description: `Edited lesson "${d.titleEn}"`,
        userId: gate.userId,
      });
    });
    revalidateTraining(existing.courseId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save this lesson" };
  }
}

export async function deleteLesson(id: string): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const existing = (await prisma.lesson.findFirst({
    where: { id },
    select: { id: true, courseId: true, titleEn: true },
  })) as { id: string; courseId: string; titleEn: string } | null;
  if (!existing) return { ok: false, error: "Lesson not found" };
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.lesson.delete({ where: { id } });
      await recordAction(tx, {
        type: "training.lesson.delete",
        entityType: "Lesson",
        entityId: id,
        description: `Deleted lesson "${existing.titleEn}"`,
        userId: gate.userId,
        payload: { courseId: existing.courseId },
      });
    });
    revalidateTraining(existing.courseId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't delete this lesson" };
  }
}

export async function moveLesson(id: string, direction: "up" | "down"): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const lesson = (await prisma.lesson.findFirst({
    where: { id },
    select: { id: true, courseId: true },
  })) as { id: string; courseId: string } | null;
  if (!lesson) return { ok: false, error: "Lesson not found" };
  // Swap rank with the immediate neighbour (same pattern as reorderAiKey).
  const all = (await prisma.lesson.findMany({
    where: { courseId: lesson.courseId },
    orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
    select: { id: true, rank: true },
  })) as { id: string; rank: number }[];
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return { ok: false, error: "Lesson not found" };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) return { ok: true };
  const here = all[idx];
  const there = all[swapIdx];
  await prisma.$transaction([
    prisma.lesson.update({ where: { id: here.id }, data: { rank: there.rank } }),
    prisma.lesson.update({ where: { id: there.id }, data: { rank: here.rank } }),
  ]);
  revalidateTraining(lesson.courseId);
  return { ok: true };
}

export async function setLessonImage(id: string, formData: FormData): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };
  const lesson = (await prisma.lesson.findFirst({
    where: { id },
    select: { id: true, courseId: true },
  })) as { id: string; courseId: string } | null;
  if (!lesson) return { ok: false, error: "Lesson not found" };
  try {
    const img = await processTrainingImage(file);
    await prisma.$transaction(async (tx: TransactionClient) => {
      // Node Buffer extends Uint8Array, but Prisma 6's generated types want
      // a strict Uint8Array<ArrayBuffer>. Wrap explicitly (same as Item.photoData).
      await tx.lesson.update({
        where: { id },
        data: { imageData: new Uint8Array(img.data), imageMime: img.mime },
      });
      await recordAction(tx, {
        type: "training.lesson.image",
        entityType: "Lesson",
        entityId: id,
        description: "Updated lesson image",
        userId: gate.userId,
      });
    });
    revalidateTraining(lesson.courseId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Image upload failed" };
  }
}

export async function clearLessonImage(id: string): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const lesson = (await prisma.lesson.findFirst({
    where: { id },
    select: { id: true, courseId: true },
  })) as { id: string; courseId: string } | null;
  if (!lesson) return { ok: false, error: "Lesson not found" };
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.lesson.update({ where: { id }, data: { imageData: null, imageMime: null } });
      await recordAction(tx, {
        type: "training.lesson.image",
        entityType: "Lesson",
        entityId: id,
        description: "Removed lesson image",
        userId: gate.userId,
      });
    });
    revalidateTraining(lesson.courseId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't remove the image" };
  }
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
  lessonId: z.string().min(1),
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
  const lesson = (await prisma.lesson.findFirst({
    where: { id: d.lessonId },
    select: { id: true, courseId: true },
  })) as { id: string; courseId: string } | null;
  if (!lesson) return { ok: false, error: "Lesson not found" };
  try {
    const question = await prisma.$transaction(async (tx: TransactionClient) => {
      const last = await tx.question.aggregate({ where: { lessonId: d.lessonId }, _max: { rank: true } });
      const q = await tx.question.create({
        data: {
          lessonId: d.lessonId,
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
        payload: { lessonId: d.lessonId },
      });
      return q;
    });
    revalidateTraining(lesson.courseId);
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
    select: { id: true, type: true, lesson: { select: { courseId: true } } },
  })) as { id: string; type: z.infer<typeof questionTypeSchema>; lesson: { courseId: string } } | null;
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
    revalidateTraining(existing.lesson.courseId);
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
    select: { id: true, lessonId: true, lesson: { select: { courseId: true } } },
  })) as { id: string; lessonId: string; lesson: { courseId: string } } | null;
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
        payload: { lessonId: existing.lessonId },
      });
    });
    revalidateTraining(existing.lesson.courseId);
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
    select: { id: true, lessonId: true, lesson: { select: { courseId: true } } },
  })) as { id: string; lessonId: string; lesson: { courseId: string } } | null;
  if (!question) return { ok: false, error: "Question not found" };
  const all = (await prisma.question.findMany({
    where: { lessonId: question.lessonId },
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
  revalidateTraining(question.lesson.courseId);
  return { ok: true };
}

export async function setQuestionImage(id: string, formData: FormData): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return gate;
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };
  const question = (await prisma.question.findFirst({
    where: { id },
    select: { id: true, lesson: { select: { courseId: true } } },
  })) as { id: string; lesson: { courseId: string } } | null;
  if (!question) return { ok: false, error: "Question not found" };
  try {
    const img = await processTrainingImage(file);
    await prisma.$transaction(async (tx: TransactionClient) => {
      // Buffer → strict Uint8Array for Prisma 6's Bytes type (see setLessonImage).
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
    revalidateTraining(question.lesson.courseId);
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
    select: { id: true, lesson: { select: { courseId: true } } },
  })) as { id: string; lesson: { courseId: string } } | null;
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
    revalidateTraining(question.lesson.courseId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't remove the image" };
  }
}

// ---------------------------------------------------------------------------
// Player-facing (any signed-in user)
// ---------------------------------------------------------------------------

const submitAttemptSchema = z.object({
  lessonId: z.string().min(1),
  answers: z.record(z.unknown()),
});

/**
 * Mark a lesson attempt SERVER-side (the client never sees the correct
 * answers — see src/server/training.ts) and record it. No superuser gate:
 * every signed-in staff member takes lessons.
 *
 * The course rules are enforced HERE, not just in the page render (a server
 * action is a plain POST endpoint — review finding: without these checks a
 * staff member could submit attempts for locked/draft lessons directly and
 * forge course progress):
 *   - the course must be published (non-superusers)
 *   - every earlier-ranked lesson's latest attempt must have passed
 * A lesson with NO questions is a content-only lesson: submitting marks it
 * complete at 100% (otherwise it could never pass and would permanently lock
 * everything after it).
 */
export async function submitLessonAttempt(
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
  const lesson = (await prisma.lesson.findFirst({
    where: { id: parsed.data.lessonId },
    select: {
      id: true,
      courseId: true,
      rank: true,
      passPct: true,
      course: { select: { published: true } },
      questions: {
        orderBy: { rank: "asc" },
        select: { id: true, type: true, config: true },
      },
    },
  })) as {
    id: string;
    courseId: string;
    rank: number;
    passPct: number;
    course: { published: boolean };
    questions: QuestionForMarking[];
  } | null;
  if (!lesson) return { ok: false, error: "Lesson not found" };

  if (!isSuperuser) {
    if (!lesson.course.published) return { ok: false, error: "Lesson not found" };
    // Same lock the player page enforces: all earlier-ranked lessons' LATEST
    // attempts must have passed.
    const earlier = (await prisma.lesson.findMany({
      where: { courseId: lesson.courseId, rank: { lt: lesson.rank } },
      select: { id: true },
    })) as { id: string }[];
    if (earlier.length > 0) {
      const latest = await latestAttemptsByLesson(uid, earlier.map((l) => l.id));
      const allPassed = earlier.every((l) => latest.get(l.id)?.passed);
      if (!allPassed) return { ok: false, error: "Finish the earlier lessons first." };
    }
  }

  // Content-only lesson (no questions): completing it = viewing it.
  const result =
    lesson.questions.length === 0
      ? { score: 100, passed: true, perQuestion: {} as Record<string, boolean> }
      : markAnswers(lesson.questions, parsed.data.answers, lesson.passPct);
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      const attempt = await tx.lessonAttempt.create({
        data: {
          lessonId: lesson.id,
          userId: uid,
          score: result.score,
          passed: result.passed,
          answers: parsed.data.answers as InputJsonValue,
        },
      });
      await recordAction(tx, {
        type: "training.attempt",
        entityType: "LessonAttempt",
        entityId: attempt.id,
        description: `Lesson attempt ${result.score}%`,
        userId: uid,
        payload: { lessonId: lesson.id, score: result.score, passed: result.passed },
      });
    });
    revalidateTraining(lesson.courseId);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save the attempt" };
  }
}
