"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ACTIVE_ORG_COOKIE } from "@/server/org";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Switch the caller into the given organisation. Refuses if the user isn't
 * a member of the target org. Sets the cookie + revalidates all server-
 * rendered routes so they re-query with the new org filter applied.
 */
export async function setActiveOrg(organizationId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const membership = await prisma.organizationMembership.findUnique({
    where: { userId_organizationId: { userId: session.user.id, organizationId } },
    select: { organizationId: true },
  });
  if (!membership) return { ok: false, error: "You aren't a member of that organisation" };

  const c = await cookies();
  c.set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  // Re-render everything so the new scoping takes effect immediately.
  revalidatePath("/", "layout");
  return { ok: true };
}
