"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { requireStaff, requireSuperuser } from "@/server/authz";
import { recordAction } from "@/server/audit";
import { processImageToBuffer } from "@/server/uploads";
import type { TransactionClient } from "@/server/decimal";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/** URL-safe slug for /t/<code>. Unguessable enough for a farm stake; the DB
 *  unique constraint catches the astronomically unlikely collision. */
function newCode(): string {
  return randomBytes(6).toString("base64url");
}

const createSchema = z.object({
  greenhouseId: z.string().min(1),
  count: z.coerce.number().int().min(1).max(200),
  /** Label prefix, e.g. "GH1" → GH1-001, GH1-002… Numbering continues after
   *  the greenhouse's existing tags with the same prefix. */
  prefix: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
});

/**
 * Mint a batch of QR stakes for a greenhouse. Tags live in their greenhouse
 * for life and get recycled crop after crop (each stay = a PlantRecord).
 */
export async function createPlantTags(
  input: unknown,
): Promise<ActionResult<{ created: number }>> {
  const gate = await requireStaff();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const { greenhouseId, count, prefix } = parsed.data;

  // Org-scoped ownership check — a cross-org greenhouse id comes back null.
  const gh = await prisma.greenhouse.findFirst({
    where: { id: greenhouseId },
    select: { id: true, name: true },
  });
  if (!gh) return { ok: false, error: "Greenhouse not found" };

  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      // Continue numbering after the highest existing "<prefix>-NNN" label.
      const existing = (await tx.plantTag.findMany({
        where: { greenhouseId, label: { startsWith: `${prefix}-` } },
        select: { label: true },
      })) as { label: string }[];
      let next = existing.reduce((max, t) => {
        const n = Number(t.label.slice(prefix.length + 1));
        return Number.isFinite(n) && n > max ? n : max;
      }, 0);

      for (let i = 0; i < count; i++) {
        next += 1;
        await tx.plantTag.create({
          data: {
            greenhouseId,
            code: newCode(),
            label: `${prefix}-${String(next).padStart(3, "0")}`,
          },
        });
      }
      await recordAction(tx, {
        type: "tags.create",
        entityType: "Greenhouse",
        entityId: greenhouseId,
        description: `Minted ${count} plant tags (${prefix}-…) for ${gh.name}`,
        userId: gate.userId,
        payload: { greenhouseId, count, prefix },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't create tags" };
  }
  revalidatePath("/tags");
  return { ok: true, data: { created: count } };
}

const assignSchema = z.object({
  tagId: z.string().min(1),
  produceId: z.string().optional(),
  plantedAt: z.string().min(1),
  seed: z.string().max(200).optional(),
  method: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * Stake the tag with a (new) plant. Ends the current stay, starts the next —
 * the tag keeps its full history, so scanning shows the live plant plus its
 * predecessors. Auto-links the greenhouse's LIVE cycle when there is one.
 */
export async function assignPlant(input: unknown): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const d = parsed.data;

  // PlantTag is org-scoped — findFirst returns null for a cross-org tag.
  const tag = await prisma.plantTag.findFirst({
    where: { id: d.tagId },
    select: { id: true, label: true, greenhouseId: true },
  });
  if (!tag) return { ok: false, error: "Tag not found" };

  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      const live = (await tx.harvest.findFirst({
        where: { greenhouseId: tag.greenhouseId, status: "LIVE" },
        orderBy: { startDate: "desc" },
        select: { id: true },
      })) as { id: string } | null;

      await tx.plantRecord.updateMany({
        where: { tagId: tag.id, endedAt: null },
        data: { endedAt: new Date() },
      });
      await tx.plantRecord.create({
        data: {
          tagId: tag.id,
          harvestId: live?.id ?? null,
          produceId: d.produceId || null,
          plantedAt: new Date(d.plantedAt),
          seed: d.seed?.trim() || null,
          method: d.method?.trim() || null,
          notes: d.notes?.trim() || null,
        },
      });
      await recordAction(tx, {
        type: "tags.assign",
        entityType: "PlantTag",
        entityId: tag.id,
        description: `Staked tag ${tag.label} with a new plant`,
        userId: gate.userId,
        payload: { tagId: tag.id, produceId: d.produceId ?? null, plantedAt: d.plantedAt },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't assign the tag" };
  }
  revalidatePath("/tags");
  return { ok: true };
}

/** Pull the stake: end the current stay without starting a new one (e.g. the
 *  cycle finished and the stakes are waiting for the next planting). */
export async function endPlantAllocation(tagId: string): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate.ok) return { ok: false, error: gate.error };
  const tag = await prisma.plantTag.findFirst({
    where: { id: tagId },
    select: { id: true, label: true },
  });
  if (!tag) return { ok: false, error: "Tag not found" };
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.plantRecord.updateMany({
        where: { tagId: tag.id, endedAt: null },
        data: { endedAt: new Date() },
      });
      await recordAction(tx, {
        type: "tags.end",
        entityType: "PlantTag",
        entityId: tag.id,
        description: `Freed tag ${tag.label} (plant ended)`,
        userId: gate.userId,
        payload: { tagId: tag.id },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't free the tag" };
  }
  revalidatePath("/tags");
  return { ok: true };
}

/**
 * Update the notes and/or photo on a plant record (the plant currently on a
 * stake, or a past one). Takes FormData so the photo File comes through. The
 * photo is resized + re-encoded to WebP and stored inline on the row (survives
 * local→prod sync). Pass clearPhoto=1 to remove the existing photo.
 *
 * PlantRecord is NOT org-scoped (it anchors via its tag), so tenancy is
 * enforced by resolving the record's tag through the org-scoped plantTag query.
 */
export async function updatePlantRecord(formData: FormData): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate.ok) return { ok: false, error: gate.error };

  const recordId = String(formData.get("recordId") ?? "");
  if (!recordId) return { ok: false, error: "Missing record" };
  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" ? notesRaw.trim() : undefined;
  const clearPhoto = formData.get("clearPhoto") === "1";
  const file = formData.get("photo");
  const hasFile = file instanceof File && file.size > 0;

  const rec = await prisma.plantRecord.findUnique({
    where: { id: recordId },
    select: { id: true, tagId: true },
  });
  if (!rec) return { ok: false, error: "Plant record not found" };
  // Tenancy: the tag query is org-scoped, so a cross-org tag comes back null.
  const tag = await prisma.plantTag.findFirst({
    where: { id: rec.tagId },
    select: { id: true, label: true },
  });
  if (!tag) return { ok: false, error: "Plant record not found" };

  const data: {
    notes?: string | null;
    photoData?: Uint8Array<ArrayBuffer> | null;
    photoMime?: string | null;
  } = {};
  if (notes !== undefined) data.notes = notes || null;
  if (hasFile) {
    try {
      const processed = await processImageToBuffer(file as File);
      // Uint8Array.from yields Uint8Array<ArrayBuffer> (a standalone copy),
      // which satisfies Prisma's Bytes input under strict TS.
      data.photoData = Uint8Array.from(processed.buffer);
      data.photoMime = processed.mime;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Couldn't process the photo" };
    }
  } else if (clearPhoto) {
    data.photoData = null;
    data.photoMime = null;
  }
  if (Object.keys(data).length === 0) return { ok: true };

  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.plantRecord.update({ where: { id: rec.id }, data });
      await recordAction(tx, {
        type: "tags.update_record",
        entityType: "PlantTag",
        entityId: tag.id,
        description: `Updated plant notes/photo on ${tag.label}`,
        userId: gate.userId,
        payload: {
          tagId: tag.id,
          recordId: rec.id,
          notesChanged: notes !== undefined,
          photoChanged: hasFile || clearPhoto,
        },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save" };
  }
  revalidatePath("/tags");
  return { ok: true };
}

/** Look up a tag by its printed label (e.g. "A012-001") so staff can jump to a
 *  plant without scanning. Case/whitespace-insensitive. Org-scoped via the
 *  plantTag query. */
export async function findTagByLabel(
  greenhouseId: string,
  label: string,
): Promise<ActionResult<{ code: string }>> {
  const gate = await requireStaff();
  if (!gate.ok) return { ok: false, error: gate.error };
  const needle = label.trim().toUpperCase();
  if (!needle) return { ok: false, error: "Type a tag number" };
  const tag = await prisma.plantTag.findFirst({
    where: { greenhouseId, label: { equals: needle, mode: "insensitive" } },
    select: { code: true },
  });
  if (!tag) return { ok: false, error: `No tag "${needle}" in this greenhouse` };
  return { ok: true, data: { code: tag.code } };
}

/** Destroy a stake and its whole history — owner only (history is money-adjacent
 *  agronomy data; losing it should be deliberate). */
export async function deletePlantTag(tagId: string): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return { ok: false, error: gate.error };
  const tag = await prisma.plantTag.findFirst({
    where: { id: tagId },
    select: { id: true, label: true },
  });
  if (!tag) return { ok: false, error: "Tag not found" };
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.plantTag.delete({ where: { id: tag.id } });
      await recordAction(tx, {
        type: "tags.delete",
        entityType: "PlantTag",
        entityId: tag.id,
        description: `Deleted plant tag ${tag.label} and its history`,
        userId: gate.userId,
        payload: { tagId: tag.id, label: tag.label },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't delete the tag" };
  }
  revalidatePath("/tags");
  return { ok: true };
}
