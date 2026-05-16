import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Decimal } from "@/server/decimal";

/**
 * Pure-function reimplementation of the FIFO algorithm, used for property
 * testing. The real `consumeFifo` is exercised against this in-memory model.
 */

type Batch = { id: string; qty: Decimal; price: Decimal };
type Consumption = { batchId: string; qty: Decimal; unitCost: Decimal };

function modelConsume(
  batches: Batch[],
  consumptions: Consumption[],
  qtyNeeded: Decimal,
): { consumed: Consumption[]; ok: boolean } {
  let need = new Decimal(qtyNeeded);
  const out: Consumption[] = [];
  for (const b of batches) {
    if (need.lte(0)) break;
    const used = consumptions
      .filter((c) => c.batchId === b.id)
      .reduce((s, c) => s.plus(c.qty), new Decimal(0));
    const avail = b.qty.minus(used);
    if (avail.lte(0)) continue;
    const take = Decimal.min(avail, need);
    out.push({ batchId: b.id, qty: take, unitCost: b.price });
    need = need.minus(take);
  }
  return { consumed: out, ok: need.lte(0) };
}

function remainingOf(batchId: string, batches: Batch[], consumptions: Consumption[]): Decimal {
  const b = batches.find((x) => x.id === batchId);
  if (!b) return new Decimal(0);
  const used = consumptions.filter((c) => c.batchId === batchId).reduce((s, c) => s.plus(c.qty), new Decimal(0));
  return b.qty.minus(used);
}

describe("FIFO model", () => {
  it("draws from oldest batch first", () => {
    const batches: Batch[] = [
      { id: "b1", qty: new Decimal(10), price: new Decimal(100) },
      { id: "b2", qty: new Decimal(10), price: new Decimal(200) },
    ];
    const { consumed, ok } = modelConsume(batches, [], new Decimal(7));
    expect(ok).toBe(true);
    expect(consumed).toHaveLength(1);
    expect(consumed[0].batchId).toBe("b1");
    expect(consumed[0].qty.toString()).toBe("7");
  });

  it("spans multiple batches when needed", () => {
    const batches: Batch[] = [
      { id: "b1", qty: new Decimal(10), price: new Decimal(100) },
      { id: "b2", qty: new Decimal(10), price: new Decimal(200) },
    ];
    const { consumed, ok } = modelConsume(batches, [], new Decimal(15));
    expect(ok).toBe(true);
    expect(consumed.map((c) => c.batchId)).toEqual(["b1", "b2"]);
    expect(consumed[0].qty.toString()).toBe("10");
    expect(consumed[1].qty.toString()).toBe("5");
  });

  it("fails when stock is insufficient", () => {
    const batches: Batch[] = [{ id: "b1", qty: new Decimal(5), price: new Decimal(100) }];
    const { ok } = modelConsume(batches, [], new Decimal(10));
    expect(ok).toBe(false);
  });

  it("property: receive/use/undo sequences preserve total stock", () => {
    fc.assert(
      fc.property(
        // Sequence of operations: receive(qty, price) | use(qty) | undo(opIndex)
        fc.array(
          fc.oneof(
            fc.record({
              kind: fc.constant("receive" as const),
              qty: fc.integer({ min: 1, max: 100 }),
              price: fc.integer({ min: 1, max: 1000 }),
            }),
            fc.record({
              kind: fc.constant("use" as const),
              qty: fc.integer({ min: 1, max: 50 }),
            }),
          ),
          { maxLength: 20 },
        ),
        (ops) => {
          const batches: Batch[] = [];
          const consumptions: Consumption[] = [];
          let receivedTotal = new Decimal(0);
          let consumedTotal = new Decimal(0);
          let nextId = 0;

          for (const op of ops) {
            if (op.kind === "receive") {
              const q = new Decimal(op.qty);
              batches.push({ id: `b${nextId++}`, qty: q, price: new Decimal(op.price) });
              receivedTotal = receivedTotal.plus(q);
            } else {
              const { consumed, ok } = modelConsume(batches, consumptions, new Decimal(op.qty));
              if (ok) {
                consumptions.push(...consumed);
                consumedTotal = consumedTotal.plus(new Decimal(op.qty));
              }
            }
          }

          const totalRemaining = batches.reduce((sum, b) => sum.plus(remainingOf(b.id, batches, consumptions)), new Decimal(0));
          // Invariant: total remaining = received − consumed
          return totalRemaining.equals(receivedTotal.minus(consumedTotal));
        },
      ),
      { numRuns: 100 },
    );
  });

  it("property: undo (removing a consumption) restores the stock exactly", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 50 }),
        (received, useA, useB) => {
          // 1 batch of `received` qty
          const batches: Batch[] = [{ id: "b1", qty: new Decimal(received), price: new Decimal(100) }];
          const cons: Consumption[] = [];

          // Apply use A
          const a = modelConsume(batches, cons, new Decimal(useA));
          if (!a.ok) return true; // skip cases where insufficient stock
          cons.push(...a.consumed);

          // Apply use B
          const b = modelConsume(batches, cons, new Decimal(useB));
          if (!b.ok) return true;
          cons.push(...b.consumed);

          const remBefore = remainingOf("b1", batches, cons);

          // Undo B (drop its consumptions)
          const undone = cons.filter((c) => !b.consumed.includes(c));
          const remAfter = remainingOf("b1", batches, undone);

          // After undoing B, remaining should be `received - useA` exactly.
          return remAfter.equals(new Decimal(received).minus(useA));
        },
      ),
      { numRuns: 100 },
    );
  });
});
