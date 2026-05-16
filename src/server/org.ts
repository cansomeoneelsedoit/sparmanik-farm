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
  const cookie = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  if (cookie) {
    const membership = await prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId: session.user.id, organizationId: cookie } },
      select: { organizationId: true },
    });
    if (membership) return membership.organizationId;
  }
  const first = await prisma.organizationMembership.findFirst({
    where: { userId: session.user.id },
    orderBy: { joinedAt: "asc" },
    select: { organizationId: true },
  });
  return first?.organizationId ?? null;
}

export async function requireActiveOrgId(): Promise<string> {
  const id = await getActiveOrgId();
  if (!id) throw new Error("No active organisation for the current user.");
  return id;
}
