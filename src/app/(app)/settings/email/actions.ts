"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/server/prisma";
import { requireSuperuser } from "@/server/authz";
import { sendMail } from "@/server/mailer";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const saveSchema = z.object({
  email: z.string().email(),
  /** Google App Password — 16 chars, Google displays it with spaces. Optional
   *  on update (blank = keep the stored one). */
  appPassword: z.string().optional().default(""),
});

/**
 * Create-or-update the org's single outgoing-mail account (Gmail + App
 * Password). Superuser-only — it holds a credential. Google shows app
 * passwords as "xxxx xxxx xxxx xxxx"; spaces are stripped so a straight
 * copy-paste just works.
 */
export async function saveMailAccount(input: unknown): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };

  const password = parsed.data.appPassword.replace(/\s+/g, "");
  const existing = (await prisma.mailAccount.findFirst()) as { id: string } | null;

  if (existing) {
    await prisma.mailAccount.update({
      where: { id: existing.id },
      data: {
        email: parsed.data.email,
        // Blank password on update = keep the stored one.
        ...(password.length >= 8 ? { appPassword: password, lastStatus: "untested", lastError: null } : {}),
      },
    });
  } else {
    if (password.length < 8) return { ok: false, error: "Paste the App Password from Google." };
    await prisma.mailAccount.create({
      data: { email: parsed.data.email, appPassword: password, lastStatus: "untested" },
    });
  }
  revalidatePath("/settings/email");
  return { ok: true };
}

export async function setMailAccountEnabled(id: string, enabled: boolean): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return { ok: false, error: gate.error };
  await prisma.mailAccount.update({ where: { id }, data: { enabled } });
  revalidatePath("/settings/email");
  return { ok: true };
}

export async function deleteMailAccount(id: string): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return { ok: false, error: gate.error };
  await prisma.mailAccount.delete({ where: { id } });
  revalidatePath("/settings/email");
  return { ok: true };
}

/** Send a test email to the account's own address (lands in its inbox + Sent). */
export async function sendTestMail(): Promise<ActionResult> {
  const gate = await requireSuperuser();
  if (!gate.ok) return { ok: false, error: gate.error };
  const acc = (await prisma.mailAccount.findFirst({ where: { enabled: true } })) as
    | { email: string }
    | null;
  if (!acc) return { ok: false, error: "No email account set up yet." };
  const r = await sendMail({
    to: acc.email,
    subject: "Sparmanik Farm — test email",
    html: "<p>This is a test from Sparmanik Farm. Receipt emails are ready to go. 🌱</p>",
    text: "This is a test from Sparmanik Farm. Receipt emails are ready to go.",
  });
  revalidatePath("/settings/email");
  return r;
}
