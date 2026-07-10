"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";

import { prisma } from "@/server/prisma";
import type { TransactionClient } from "@/server/decimal";
import { auth } from "@/auth";
import { requireActiveOrgId } from "@/server/org";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

async function assertSuperuser(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (session.user.role !== "SUPERUSER") return { ok: false, error: "Forbidden" };
  return { ok: true, userId: session.user.id };
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  // PORTAL = education-only login: same account + org membership as everyone
  // else, but the proxy fences them into /training*.
  role: z.enum(["USER", "SUPERUSER", "PORTAL"]).default("USER"),
  password: z.string().min(6),
});

export async function createUser(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await assertSuperuser();
  if (!auth.ok) return auth;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  // New accounts get a membership in the current org so they sign in with a
  // resolvable org (the scoping layer now fails closed on membership-less
  // logins — app review #3).
  const orgId = await requireActiveOrgId();
  try {
    const u = await prisma.$transaction(async (tx: TransactionClient) => {
      const created = await tx.user.create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email.toLowerCase(),
          role: parsed.data.role,
          passwordHash: await bcrypt.hash(parsed.data.password, 10),
        },
      });
      await tx.organizationMembership.create({
        data: { userId: created.id, organizationId: orgId, role: "MEMBER" },
      });
      return created;
    });
    revalidatePath("/admin/users");
    return { ok: true, data: { id: u.id } };
  } catch {
    return { ok: false, error: "Email is already in use" };
  }
}

const updateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["USER", "SUPERUSER", "PORTAL"]),
});

export async function updateUser(id: string, input: unknown): Promise<ActionResult> {
  const auth = await assertSuperuser();
  if (!auth.ok) return auth;
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  // Refuse to demote the last remaining superuser (to USER *or* PORTAL) —
  // leaves no one to run /admin/users.
  if (parsed.data.role !== "SUPERUSER") {
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (target?.role === "SUPERUSER") {
      const supers = await prisma.user.count({ where: { role: "SUPERUSER" } });
      if (supers <= 1) return { ok: false, error: "Can't demote the only superuser" };
    }
  }
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.user.update({
        where: { id },
        data: {
          name: parsed.data.name,
          email: parsed.data.email.toLowerCase(),
          role: parsed.data.role,
        },
      });
      // Mirror the name onto the linked Staff row so /staff stays in sync.
      // Email isn't mirrored — Staff has no email field — and role is auth-
      // only, not a farm concept.
      await tx.staff.updateMany({
        where: { userId: id },
        data: { name: parsed.data.name },
      });
    });
    revalidatePath("/admin/users");
    revalidatePath("/staff");
    return { ok: true };
  } catch {
    return { ok: false, error: "Email is already in use" };
  }
}

const resetSchema = z.object({ password: z.string().min(6) });

export async function resetUserPassword(id: string, input: unknown): Promise<ActionResult> {
  const auth = await assertSuperuser();
  if (!auth.ok) return auth;
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Password must be at least 6 characters" };
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 10) },
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteUser(id: string): Promise<ActionResult> {
  const a = await assertSuperuser();
  if (!a.ok) return a;
  if (id === a.userId) return { ok: false, error: "Can't delete yourself" };
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (target?.role === "SUPERUSER") {
    const supers = await prisma.user.count({ where: { role: "SUPERUSER" } });
    if (supers <= 1) return { ok: false, error: "Can't delete the only superuser" };
  }
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      // Drop the linked Staff first (if any) so the FK constraint doesn't
      // block the user delete. If the staff has wage entries the inner
      // delete will throw and the whole transaction rolls back.
      await tx.staff.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
  } catch {
    return {
      ok: false,
      error: "Can't delete this user — their staff record has wage entries. Delete those first.",
    };
  }
  revalidatePath("/admin/users");
  revalidatePath("/staff");
  return { ok: true };
}
