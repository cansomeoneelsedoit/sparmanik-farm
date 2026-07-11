"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { requireActiveOrgId } from "@/server/org";
import { recordAction } from "@/server/audit";
import type { TransactionClient } from "@/server/decimal";
import {
  generateTempPassword,
  generateInviteToken,
  hashPassword,
  synthLoginLocalPart,
  SYNTH_LOGIN_DOMAIN,
} from "@/server/student-portal";
import { sendStudentInvite } from "@/server/mailer";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/** Credentials handed back to the admin after create/resend — shown ONCE so
 *  they can be copied or WhatsApp'd. The temp password is never stored in the
 *  clear; this is the only moment it exists in plaintext. */
export type StudentCredentials = {
  studentId: string;
  name: string;
  loginEmail: string;
  tempPassword: string;
  /** True when a "set your password" invite email was actually sent. */
  emailed: boolean;
  /** Real email (for display) — null for synthetic email-less logins. */
  realEmail: string | null;
  phone: string | null;
};

async function assertSuperuser(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (session.user.role !== "SUPERUSER") return { ok: false, error: "Forbidden" };
  return { ok: true, userId: session.user.id };
}

/** Absolute origin of THIS request, so invite links are correct on localhost
 *  and Railway alike without hardcoding a URL or depending on AUTH_URL. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  // Optional — a student with no email gets a synthetic login username.
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  courseIds: z.array(z.string().min(1)).optional().default([]),
});

/**
 * Onboard a portal student: create a PORTAL account with a temporary password,
 * optionally email a "set your password" invite, and assign the chosen
 * courses. Returns the credentials to show the admin once (temp password +
 * login). mustChangePassword is set so the temp password can't be kept.
 */
export async function createStudent(input: unknown): Promise<ActionResult<StudentCredentials>> {
  const gate = await assertSuperuser();
  if (!gate.ok) return gate;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }
  const orgId = await requireActiveOrgId();

  const realEmail = parsed.data.email && parsed.data.email.trim() !== ""
    ? parsed.data.email.trim().toLowerCase()
    : null;
  const phone = parsed.data.phone && parsed.data.phone.trim() !== "" ? parsed.data.phone.trim() : null;
  const loginEmail = realEmail ?? `${synthLoginLocalPart(parsed.data.name)}@${SYNTH_LOGIN_DOMAIN}`;

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  // Only real-email students can receive an emailed invite link.
  const invite = realEmail ? generateInviteToken() : null;

  let studentId: string;
  try {
    studentId = await prisma.$transaction(async (tx: TransactionClient) => {
      const created = await tx.user.create({
        data: {
          name: parsed.data.name,
          email: loginEmail,
          phone,
          role: "PORTAL",
          passwordHash,
          mustChangePassword: true,
          inviteTokenHash: invite?.hash ?? null,
          inviteTokenExpiry: invite?.expiry ?? null,
        },
        select: { id: true },
      });
      await tx.organizationMembership.create({
        data: { userId: created.id, organizationId: orgId, role: "MEMBER" },
      });
      for (const courseId of parsed.data.courseIds) {
        await tx.courseEnrollment.create({
          data: { organizationId: orgId, courseId, userId: created.id, paidVia: "granted", note: "Assigned" },
        });
      }
      await recordAction(tx, {
        type: "student.create",
        entityType: "User",
        entityId: created.id,
        description: `Onboarded student "${parsed.data.name}"`,
        userId: gate.userId,
        payload: { courses: parsed.data.courseIds.length, emailInvite: Boolean(invite) },
      });
      return created.id;
    });
  } catch {
    return { ok: false, error: "That email is already in use." };
  }

  // Best-effort email invite AFTER the account exists (a mail failure must not
  // roll back the student — the admin still has the temp password to send).
  let emailed = false;
  if (invite && realEmail) {
    const link = `${await requestOrigin()}/accept-invite?token=${encodeURIComponent(invite.token)}`;
    const r = await sendStudentInvite({ to: realEmail, name: parsed.data.name, link });
    emailed = r.ok;
  }

  revalidatePath("/students");
  revalidatePath("/admin/users");
  return {
    ok: true,
    data: { studentId, name: parsed.data.name, loginEmail, tempPassword, emailed, realEmail, phone },
  };
}

/**
 * Reset a student's login: fresh temp password (forces a change on next
 * sign-in) and, if they have a real email + mail is configured, a new invite
 * link. Returns the new credentials to show once.
 */
export async function resendStudentLogin(id: string): Promise<ActionResult<StudentCredentials>> {
  const gate = await assertSuperuser();
  if (!gate.ok) return gate;
  const student = (await prisma.user.findFirst({
    where: { id, role: "PORTAL" },
    select: { id: true, name: true, email: true, phone: true },
  })) as { id: string; name: string | null; email: string; phone: string | null } | null;
  if (!student) return { ok: false, error: "Student not found" };

  const realEmail = student.email.endsWith(`@${SYNTH_LOGIN_DOMAIN}`) ? null : student.email;
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const invite = realEmail ? generateInviteToken() : null;

  await prisma.user.update({
    where: { id },
    data: {
      passwordHash,
      mustChangePassword: true,
      inviteTokenHash: invite?.hash ?? null,
      inviteTokenExpiry: invite?.expiry ?? null,
    },
  });

  let emailed = false;
  if (invite && realEmail) {
    const link = `${await requestOrigin()}/accept-invite?token=${encodeURIComponent(invite.token)}`;
    const r = await sendStudentInvite({ to: realEmail, name: student.name ?? "there", link });
    emailed = r.ok;
  }

  revalidatePath("/students");
  return {
    ok: true,
    data: {
      studentId: id,
      name: student.name ?? "",
      loginEmail: student.email,
      tempPassword,
      emailed,
      realEmail,
      phone: student.phone,
    },
  };
}

const coursesSchema = z.object({
  studentId: z.string().min(1),
  courseIds: z.array(z.string().min(1)),
});

/** Sync a student's assigned courses to exactly `courseIds` (add missing,
 *  remove dropped). Assignments are granted CourseEnrollments. */
export async function setStudentCourses(input: unknown): Promise<ActionResult> {
  const gate = await assertSuperuser();
  if (!gate.ok) return gate;
  const parsed = coursesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const orgId = await requireActiveOrgId();

  const student = await prisma.user.findFirst({
    where: { id: parsed.data.studentId, role: "PORTAL" },
    select: { id: true },
  });
  if (!student) return { ok: false, error: "Student not found" };

  const existing = (await prisma.courseEnrollment.findMany({
    where: { userId: parsed.data.studentId },
    select: { id: true, courseId: true, paidVia: true, paidAmount: true },
  })) as { id: string; courseId: string; paidVia: string | null; paidAmount: unknown }[];
  const want = new Set(parsed.data.courseIds);
  // Every course the student is ALREADY in (granted OR paid) — used to avoid
  // creating a duplicate that would violate the (courseId,userId) unique.
  const haveAny = new Set(existing.map((e) => e.courseId));
  // Only rows THIS tool created (granted, no money attached) may be removed.
  // A PAID enrollment carries a real payment record — unticking it here must
  // never delete it (that would silently revoke paid access and destroy the
  // record). Paid access is managed on the course's Access page instead.
  const granted = existing.filter((e) => e.paidVia === "granted" && e.paidAmount == null);
  const toAdd = parsed.data.courseIds.filter((c) => !haveAny.has(c));
  const toRemove = granted.filter((e) => !want.has(e.courseId)).map((e) => e.id);

  await prisma.$transaction(async (tx: TransactionClient) => {
    if (toRemove.length > 0) {
      await tx.courseEnrollment.deleteMany({ where: { id: { in: toRemove } } });
    }
    for (const courseId of toAdd) {
      await tx.courseEnrollment.create({
        data: { organizationId: orgId, courseId, userId: parsed.data.studentId, paidVia: "granted", note: "Assigned" },
      });
    }
  });

  revalidatePath("/students");
  revalidatePath(`/students/${parsed.data.studentId}`);
  return { ok: true };
}

/** Remove a student and their portal data (enrollments + attempts + login).
 *  Only PORTAL accounts can be deleted here — never staff/owner accounts. */
export async function deleteStudent(id: string): Promise<ActionResult> {
  const gate = await assertSuperuser();
  if (!gate.ok) return gate;
  const student = await prisma.user.findFirst({
    where: { id, role: "PORTAL" },
    select: { id: true, name: true },
  });
  if (!student) return { ok: false, error: "Student not found" };
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.moduleAttempt.deleteMany({ where: { userId: id } });
      await tx.courseEnrollment.deleteMany({ where: { userId: id } });
      await tx.organizationMembership.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
      await recordAction(tx, {
        type: "student.delete",
        entityType: "User",
        entityId: id,
        description: `Removed student "${student.name ?? id}"`,
        userId: gate.userId,
      });
    });
  } catch {
    return { ok: false, error: "Couldn't remove this student." };
  }
  revalidatePath("/students");
  revalidatePath("/admin/users");
  return { ok: true };
}
