import { cache } from "react";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";

export type AlertSeverity = "critical" | "warning" | "low";

export type Alert = {
  id: string;
  severity: AlertSeverity;
  text: string;
  href: string;
};

function alertId(prefix: string, parts: (string | number)[]): string {
  return `${prefix}:${parts.join(":")}`;
}

export const getAlerts = cache(async (): Promise<Alert[]> => {
  const alerts: Alert[] = [];

  // ---- Low/critical stock ----
  const items = await prisma.item.findMany({
    select: {
      id: true,
      name: true,
      reorder: true,
      batches: { select: { qty: true, consumptions: { select: { qty: true } } } },
    },
  });
  for (const item of items) {
    const remaining = item.batches.reduce((sum: Decimal, b: { qty: Decimal; consumptions: { qty: Decimal }[] }) => {
      const used = b.consumptions.reduce((s: Decimal, c: { qty: Decimal }) => s.plus(c.qty), new Decimal(0));
      return sum.plus(new Decimal(b.qty).minus(used));
    }, new Decimal(0));
    const reorder = new Decimal(item.reorder);
    if (reorder.lte(0)) continue;
    if (remaining.eq(0)) {
      alerts.push({
        id: alertId("stock-out", [item.id]),
        severity: "critical",
        text: `${item.name} — Out of stock`,
        href: `/inventory/${item.id}`,
      });
    } else if (remaining.lte(reorder.times(0.2))) {
      alerts.push({
        id: alertId("stock-crit", [item.id]),
        severity: "critical",
        text: `${item.name} — Critical low stock`,
        href: `/inventory/${item.id}`,
      });
    } else if (remaining.lte(reorder.times(0.5))) {
      alerts.push({
        id: alertId("stock-low", [item.id]),
        severity: "warning",
        text: `${item.name} — Low stock`,
        href: `/inventory/${item.id}`,
      });
    }
  }

  // ---- Active harvests ----
  const liveHarvests = await prisma.harvest.findMany({
    where: { status: "LIVE" },
    select: { id: true, name: true },
  });
  for (const h of liveHarvests) {
    alerts.push({
      id: alertId("harvest-live", [h.id]),
      severity: "low",
      text: `${h.name} — Active harvest`,
      href: `/harvest/${h.id}`,
    });
  }

  // ---- Overdue tasks ----
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = await prisma.task.findMany({
    where: { status: { not: "COMPLETED" }, dueDate: { lt: today } },
    select: { id: true, title: true },
  });
  for (const t of overdue) {
    alerts.push({
      id: alertId("task-overdue", [t.id]),
      severity: "critical",
      text: `${t.title} — Overdue`,
      href: `/tasks`,
    });
  }

  return alerts;
});
