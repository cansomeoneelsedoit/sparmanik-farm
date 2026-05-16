import { prisma } from "@/server/prisma";
import type { InputJsonValue, TransactionClient } from "@/server/decimal";

type AnyTx = TransactionClient | typeof prisma;

export type AuditPayload = Record<string, unknown>;

export type RecordActionArgs = {
  type: string;
  entityType: string;
  entityId: string;
  description: string;
  userId?: string | null;
  payload?: AuditPayload;
};

export async function recordAction(tx: AnyTx, args: RecordActionArgs) {
  return tx.auditAction.create({
    data: {
      type: args.type,
      entityType: args.entityType,
      entityId: args.entityId,
      description: args.description,
      userId: args.userId ?? null,
      payload: (args.payload ?? {}) as InputJsonValue,
    },
  });
}

export type AuditActionRecord = {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  payload: AuditPayload;
};

type UndoHandler = (tx: TransactionClient, action: AuditActionRecord) => Promise<void>;

const undoHandlers = new Map<string, UndoHandler>();

export function registerUndoHandler(type: string, handler: UndoHandler) {
  undoHandlers.set(type, handler);
}

export async function undoAction(actionId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  return prisma.$transaction(async (tx: TransactionClient) => {
    const action = await tx.auditAction.findUnique({ where: { id: actionId } });
    if (!action) return { ok: false as const, reason: "Action not found" };
    if (action.undone) return { ok: false as const, reason: "Already undone" };
    const handler = undoHandlers.get(action.type);
    if (!handler) return { ok: false as const, reason: `No undo handler registered for "${action.type}"` };

    await handler(tx as TransactionClient, {
      id: action.id,
      type: action.type,
      entityType: action.entityType,
      entityId: action.entityId,
      payload: action.payload as AuditPayload,
    });
    await tx.auditAction.update({
      where: { id: actionId },
      data: { undone: true, undoneAt: new Date() },
    });
    return { ok: true as const };
  });
}

export async function recentActions(limit = 50) {
  return prisma.auditAction.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
