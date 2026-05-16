"use server";

import { revalidatePath } from "next/cache";

import { undoAction } from "@/server/audit";
import { registerAllUndoHandlers } from "@/server/audit-handlers";

registerAllUndoHandlers();

export async function undoActionById(actionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  registerAllUndoHandlers();
  try {
    const r = await undoAction(actionId);
    if (!r.ok) return { ok: false, error: r.reason };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to undo" };
  }
}
