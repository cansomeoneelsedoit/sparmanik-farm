/**
 * Wires every undo handler into the audit registry. Imported once from the
 * audit sheet (which lives in the app shell) so the registry is populated on
 * every authenticated request.
 */
import { registerUndoHandler } from "@/server/audit";

let registered = false;

export function registerAllUndoHandlers() {
  if (registered) return;
  registered = true;

  // Inventory: receive_stock — delete the batch (cascade deletes consumptions).
  registerUndoHandler("inventory.receive_stock", async (tx, action) => {
    const batchId = (action.payload.batchId as string) ?? action.entityId;
    await tx.batch.delete({ where: { id: batchId } });
  });

  // Inventory: use_stock — delete the BatchConsumption rows the action made.
  registerUndoHandler("inventory.use_stock", async (tx, action) => {
    const ids = action.payload.consumptionIds as string[] | undefined;
    if (!ids?.length) return;
    await tx.batchConsumption.deleteMany({ where: { id: { in: ids } } });
  });

  // Item create — delete the item.
  registerUndoHandler("item.create", async (tx, action) => {
    await tx.item.delete({ where: { id: action.entityId } });
  });

  // Item delete — restore (best-effort; only the row, not its batches).
  registerUndoHandler("item.delete", async (tx, action) => {
    const item = action.payload as Record<string, unknown>;
    if (!item?.id) return;
    await tx.item.create({
      data: {
        id: item.id as string,
        name: item.name as string,
        categoryId: (item.categoryId as string | null) ?? null,
        unit: item.unit as string,
        subUnit: (item.subUnit as string | null) ?? null,
        location: (item.location as string | null) ?? null,
        reusable: Boolean(item.reusable),
        reorder: item.reorder as never,
        shopeeUrl: (item.shopeeUrl as string | null) ?? null,
        defaultSupplierId: (item.defaultSupplierId as string | null) ?? null,
      },
    });
  });

  // Supplier create — delete the supplier.
  registerUndoHandler("supplier.create", async (tx, action) => {
    await tx.supplier.delete({ where: { id: action.entityId } });
  });

  // Supplier update — restore prior values.
  registerUndoHandler("supplier.update", async (tx, action) => {
    const before = action.payload.before as Record<string, unknown> | undefined;
    if (!before?.id) return;
    await tx.supplier.update({
      where: { id: before.id as string },
      data: {
        name: before.name as string,
        phone: (before.phone as string | null) ?? null,
        email: (before.email as string | null) ?? null,
        notes: (before.notes as string | null) ?? null,
        shopUrl: (before.shopUrl as string | null) ?? null,
      },
    });
  });

  // Harvest start — delete (cascades to sales/usage/assets/tasks).
  registerUndoHandler("harvest.start", async (tx, action) => {
    await tx.harvest.delete({ where: { id: action.entityId } });
  });
  registerUndoHandler("harvest.end", async (tx, action) => {
    await tx.harvest.update({
      where: { id: action.entityId },
      data: { status: "LIVE", endDate: null },
    });
  });
  registerUndoHandler("harvest.use_stock", async (tx, action) => {
    await tx.harvestUsage.delete({ where: { id: action.entityId } });
  });
  registerUndoHandler("harvest.install_asset", async (tx, action) => {
    await tx.harvestAsset.delete({ where: { id: action.entityId } });
  });
  registerUndoHandler("harvest.log_sale", async (tx, action) => {
    await tx.sale.delete({ where: { id: action.entityId } });
  });

  // Staff / wages
  registerUndoHandler("staff.create", async (tx, action) => {
    await tx.staff.delete({ where: { id: action.entityId } });
  });
  registerUndoHandler("staff.pay_rise", async (tx, action) => {
    await tx.staffRate.delete({ where: { id: action.entityId } });
  });
  registerUndoHandler("wage.create", async (tx, action) => {
    await tx.wageEntry.delete({ where: { id: action.entityId } });
  });

  // Tasks
  registerUndoHandler("task.create", async (tx, action) => {
    await tx.task.delete({ where: { id: action.entityId } });
  });
  registerUndoHandler("task.delete", async (tx, action) => {
    const t = action.payload as Record<string, unknown>;
    if (!t?.id) return;
    await tx.task.create({
      data: {
        id: t.id as string,
        title: t.title as string,
        dueDate: new Date(t.dueDate as string),
        priority: t.priority as "LOW" | "MEDIUM" | "HIGH",
        status: t.status as "PENDING" | "IN_PROGRESS" | "COMPLETED",
        assigneeStaffId: (t.assigneeStaffId as string | null) ?? null,
        harvestId: (t.harvestId as string | null) ?? null,
        description: (t.description as string | null) ?? null,
        instructions: (t.instructions as string | null) ?? null,
        notes: (t.notes as string | null) ?? null,
      },
    });
  });
  registerUndoHandler("task.status", async (tx, action) => {
    const p = action.payload as { from: "PENDING" | "IN_PROGRESS" | "COMPLETED" };
    if (!p?.from) return;
    await tx.task.update({ where: { id: action.entityId }, data: { status: p.from } });
  });

  // Supplier delete — recreate.
  registerUndoHandler("supplier.delete", async (tx, action) => {
    const s = action.payload as Record<string, unknown>;
    if (!s?.id) return;
    await tx.supplier.create({
      data: {
        id: s.id as string,
        name: s.name as string,
        phone: (s.phone as string | null) ?? null,
        email: (s.email as string | null) ?? null,
        notes: (s.notes as string | null) ?? null,
        shopUrl: (s.shopUrl as string | null) ?? null,
      },
    });
  });
}
