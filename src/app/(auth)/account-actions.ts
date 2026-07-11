"use server";

import { z } from "zod";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { hashPassword, hashInviteToken } from "@/server/student-portal";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

// Passwords the student chooses for themselves — min 8, no other rule (these
// are learners, not admins; usability over complexity theatre).
const passwordSchema = z.string().min(8, "Use at least 8 characters").max(200);

/**
 * PUBLIC (no session): consume an emailed invite token and set the student's
 * own password. The token in the URL is the sole credential — validated by
 * comparing its SHA-256 hash against the stored one and checking expiry.
 * Single-use: the token is cleared on success. Clears the forced-change flag,
 * so after this they sign in normally.
 */
export async function acceptInvite(input: unknown): Promise<ActionResult<{ email: string }>> {
  const schema = z.object({ token: z.string().min(10), password: passwordSchema });
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const hash = hashInviteToken(parsed.data.token);
  const user = (await prisma.user.findFirst({
    where: { inviteTokenHash: hash },
    select: { id: true, email: true, inviteTokenExpiry: true },
  })) as { id: string; email: string; inviteTokenExpiry: Date | null } | null;
  if (!user || !user.inviteTokenExpiry || user.inviteTokenExpiry.getTime() < Date.now()) {
    return { ok: false, error: "This invite link is invalid or has expired. Ask for a new one." };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.password),
      mustChangePassword: false,
      inviteTokenHash: null,
      inviteTokenExpiry: null,
    },
  });
  return { ok: true, data: { email: user.email } };
}

/**
 * AUTHED: a signed-in user (a temp-password student hitting the forced-change
 * gate, or anyone changing their own password) sets a new password. Clears the
 * forced-change flag in the DB. The set-password form then re-authenticates
 * via signIn("credentials", …) with the new password, which re-mints the JWT
 * from the fresh DB value so the proxy stops fencing them — we never trust a
 * client-supplied session update to clear the flag.
 */
export async function setOwnPassword(input: unknown): Promise<ActionResult> {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return { ok: false, error: "Not signed in" };
  const parsed = z.object({ password: passwordSchema }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  await prisma.user.update({
    where: { id: uid },
    data: {
      passwordHash: await hashPassword(parsed.data.password),
      mustChangePassword: false,
      inviteTokenHash: null,
      inviteTokenExpiry: null,
    },
  });
  return { ok: true };
}
