"use server";

import { prisma } from "@/server/prisma";

export type SearchHit = {
  /** Where Enter takes you. */
  href: string;
  /** Primary line. */
  label: string;
  /** Secondary line — code, status, role… */
  detail: string;
  /** Group header the hit renders under. */
  group: "Items" | "Greenhouses" | "Suppliers" | "Staff";
};

/**
 * Backend for the global command palette (Ctrl+K). One round-trip
 * searches the four entity types staff actually look for by name. The
 * org-scoping Prisma extension applies automatically (this runs in a
 * request context with the activeOrgId cookie), so results never leak
 * across organisations.
 *
 * Page/action navigation entries are static and live client-side in the
 * palette component — no need to ship them through a server action.
 */
export async function globalSearch(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const contains = { contains: q, mode: "insensitive" as const };

  const [items, harvests, suppliers, staff] = await Promise.all([
    prisma.item.findMany({
      where: { OR: [{ name: contains }, { code: contains }] },
      orderBy: { name: "asc" },
      take: 8,
      select: { id: true, code: true, name: true, unit: true },
    }),
    prisma.harvest.findMany({
      where: { name: contains },
      orderBy: { startDate: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        status: true,
        greenhouse: { select: { name: true } },
      },
    }),
    prisma.supplier.findMany({
      where: { name: contains },
      orderBy: { name: "asc" },
      take: 5,
      select: { id: true, name: true },
    }),
    prisma.staff.findMany({
      where: { name: contains },
      orderBy: { name: "asc" },
      take: 4,
      select: { id: true, name: true, role: true },
    }),
  ]);

  const hits: SearchHit[] = [];
  for (const i of items as { id: string; code: string; name: string; unit: string }[]) {
    hits.push({
      href: `/inventory/${i.id}`,
      label: i.name?.trim() || `(Untitled ${i.code})`,
      detail: `${i.code} · ${i.unit}`,
      group: "Items",
    });
  }
  for (const h of harvests as {
    id: string;
    name: string;
    status: string;
    greenhouse: { name: string };
  }[]) {
    hits.push({
      href: `/harvest/${h.id}`,
      label: h.name,
      detail: `${h.greenhouse.name} · ${h.status === "LIVE" ? "Live" : "Closed"}`,
      group: "Greenhouses",
    });
  }
  for (const s of suppliers as { id: string; name: string }[]) {
    hits.push({
      href: `/suppliers/${s.id}`,
      label: s.name,
      detail: "Supplier",
      group: "Suppliers",
    });
  }
  for (const s of staff as { id: string; name: string; role: string | null }[]) {
    hits.push({
      href: `/staff`,
      label: s.name,
      detail: s.role || "Staff",
      group: "Staff",
    });
  }
  return hits;
}
