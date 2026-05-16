"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import type { TransactionClient } from "@/server/decimal";
import { auth } from "@/auth";
import { recordAction } from "@/server/audit";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

async function uid() {
  return (await auth())?.user?.id ?? null;
}

const newSchema = z.object({
  title: z.string().min(1),
  assigneeStaffId: z.string().optional().nullable(),
  dueDate: z.string().min(1),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  harvestId: z.string().optional().nullable(),
  description: z.string().optional().default(""),
  instructions: z.string().optional().default(""),
});

export async function createTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = newSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const userId = await uid();
  const task = await prisma.$transaction(async (tx: TransactionClient) => {
    const created = await tx.task.create({
      data: {
        title: parsed.data.title,
        assigneeStaffId: parsed.data.assigneeStaffId || null,
        dueDate: new Date(parsed.data.dueDate),
        priority: parsed.data.priority,
        harvestId: parsed.data.harvestId || null,
        description: parsed.data.description || null,
        instructions: parsed.data.instructions || null,
      },
    });
    await recordAction(tx, {
      type: "task.create",
      entityType: "Task",
      entityId: created.id,
      description: `Added task: ${created.title}`,
      userId,
      payload: {},
    });
    return created;
  });
  revalidatePath("/tasks");
  return { ok: true, data: { id: task.id } };
}

export async function setTaskStatus(
  id: string,
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED",
): Promise<ActionResult> {
  const userId = await uid();
  await prisma.$transaction(async (tx: TransactionClient) => {
    const before = await tx.task.findUnique({ where: { id } });
    if (!before) throw new Error("Task not found");
    await tx.task.update({ where: { id }, data: { status } });
    await recordAction(tx, {
      type: "task.status",
      entityType: "Task",
      entityId: id,
      description: `Task status → ${status}`,
      userId,
      payload: { from: before.status, to: status },
    });
  });
  revalidatePath("/tasks");
  return { ok: true };
}

export async function assignTask(id: string, staffId: string | null): Promise<ActionResult> {
  const userId = await uid();
  await prisma.task.update({ where: { id }, data: { assigneeStaffId: staffId } });
  void userId;
  revalidatePath("/tasks");
  return { ok: true };
}

const commentSchema = z.object({
  taskId: z.string(),
  author: z.string().min(1),
  text: z.string().min(1),
  role: z.enum(["ADMIN", "STAFF"]).default("ADMIN"),
});

export async function addTaskComment(input: unknown): Promise<ActionResult> {
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  await prisma.taskComment.create({
    data: {
      taskId: parsed.data.taskId,
      author: parsed.data.author,
      text: parsed.data.text,
      role: parsed.data.role,
    },
  });
  revalidatePath("/tasks");
  return { ok: true };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const userId = await uid();
  await prisma.$transaction(async (tx: TransactionClient) => {
    const t = await tx.task.findUnique({ where: { id } });
    if (!t) throw new Error("Task not found");
    await tx.task.delete({ where: { id } });
    await recordAction(tx, {
      type: "task.delete",
      entityType: "Task",
      entityId: id,
      description: `Deleted task: ${t.title}`,
      userId,
      payload: t,
    });
  });
  revalidatePath("/tasks");
  return { ok: true };
}
