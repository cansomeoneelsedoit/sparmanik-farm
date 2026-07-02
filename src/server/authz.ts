import { auth } from "@/auth";

export type AuthzResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/**
 * Server-side role gate. Use at the TOP of any action that changes money,
 * pay/wages, org-wide settings, AI keys, or accounts. Hiding a button in the
 * sidebar is not security — server actions are directly callable — so the gate
 * has to live here (app review #5, #40).
 *
 * "SUPERUSER" is the owner tier today. Field staff are "USER" and must not be
 * able to rewrite the farm's finances.
 */
export async function requireSuperuser(): Promise<AuthzResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  if ((session.user as { role?: string }).role !== "SUPERUSER") {
    return { ok: false, error: "Only the farm owner can do this." };
  }
  return { ok: true, userId: session.user.id };
}
