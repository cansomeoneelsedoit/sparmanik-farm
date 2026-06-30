import { cookies } from "next/headers";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const ACTIVE_ORG_COOKIE = "activeOrgId";

export type OrgSummary = {
  id: string;
  name: string;
  slug: string;
  role: "OWNER" | "MEMBER";
};

/**
 * Returns the orgs the current user is a member of, newest-first by joinedAt.
 * Used by the topbar switcher.
 */
export async function listMyOrgs(): Promise<OrgSummary[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  // A superuser (owner) manages every farm — list them all so the switcher can
  // move between any of them. Regular staff see only their memberships.
  if ((session.user as { role?: string }).role === "SUPERUSER") {
    const orgs = await prisma.organization.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, slug: true },
    });
    type O = (typeof orgs)[number];
    return (orgs as O[]).map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      role: "OWNER" as const,
    }));
  }
  const memberships = await prisma.organizationMembership.findMany({
    where: { userId: session.user.id },
    orderBy: { joinedAt: "asc" },
    select: {
      role: true,
      organization: { select: { id: true, name: true, slug: true } },
    },
  });
  type Row = (typeof memberships)[number];
  return memberships.map((m: Row) => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    role: m.role,
  }));
}

/**
 * Determines the active organisation for the current request. Order:
 * 1. Cookie value, if the user is a member of that org.
 * 2. First membership (fallback when no cookie or user moved orgs).
 * Returns null only for unauthenticated requests or users with no memberships.
 */
export async function getActiveOrgId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const isSuper = (session.user as { role?: string }).role === "SUPERUSER";
  const cookie = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  if (cookie) {
    if (isSuper) {
      const org = await prisma.organization.findUnique({ where: { id: cookie }, select: { id: true } });
      if (org) return org.id;
    } else {
      const membership = await prisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: cookie } },
        select: { organizationId: true },
      });
      if (membership) return membership.organizationId;
    }
  }
  const first = await prisma.organizationMembership.findFirst({
    where: { userId: session.user.id },
    orderBy: { joinedAt: "asc" },
    select: { organizationId: true },
  });
  if (first?.organizationId) return first.organizationId;
  // A superuser with no membership still manages the farms — default to the
  // primary org (they switch via the cookie above).
  if (isSuper) return primaryOrgId();
  return null;
}

/** The "main" org — the one with the most members (ties broken by oldest). */
async function primaryOrgId(): Promise<string | null> {
  type OrgRow = { id: string; createdAt: Date; _count: { memberships: number } };
  const orgs = (await prisma.organization.findMany({
    select: { id: true, createdAt: true, _count: { select: { memberships: true } } },
  })) as OrgRow[];
  if (orgs.length === 0) return null;
  orgs.sort((a, b) => {
    const byMembers = (b._count?.memberships ?? 0) - (a._count?.memberships ?? 0);
    if (byMembers !== 0) return byMembers;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return orgs[0].id;
}

export async function requireActiveOrgId(): Promise<string> {
  const id = await getActiveOrgId();
  if (!id) throw new Error("No active organisation for the current user.");
  return id;
}
