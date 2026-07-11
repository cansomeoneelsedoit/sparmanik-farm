"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { StudentCredentials } from "@/app/(app)/students/actions";

/**
 * One-time credentials card, reused after both create AND resend. The temp
 * password only exists in plaintext at this moment — this component is how Boyd
 * captures it (copy, or fire it over WhatsApp) before it's gone. Origin-based
 * links are read from window.location at click time (client-only, no SSR).
 */

/** Login block sent over WhatsApp and copied by "Copy all" — kept identical so
 *  the student gets the same message whichever way Boyd sends it. */
function loginMessage(c: StudentCredentials, origin: string): string {
  return (
    `Halo ${c.name}! Login Sparmanik Farm Learning Portal:\n` +
    `${origin}/learn\n` +
    `Email: ${c.loginEmail}\n` +
    `Password: ${c.tempPassword}\n\n` +
    `Silakan login dan ganti password Anda.`
  );
}

/** Phone → wa.me digits: strip non-digits, and a leading 0 becomes 62 (ID). */
function waDigits(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^0/, "62");
}

export function CredentialsReveal({ credentials }: { credentials: StudentCredentials }) {
  const c = credentials;
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((cur) => (cur === key ? null : cur)), 1500);
    } catch {
      toast.error("Couldn't copy — select the text and copy it manually.");
    }
  }

  function copyAll() {
    copy("all", loginMessage(c, window.location.origin));
    toast.success("Login details copied");
  }

  function sendWhatsApp() {
    if (!c.phone) return;
    const url = `https://wa.me/${waDigits(c.phone)}?text=${encodeURIComponent(
      loginMessage(c, window.location.origin),
    )}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
      {/* Delivery status */}
      {c.emailed ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400">
          <Check className="h-4 w-4 shrink-0" /> Invite email sent to {c.realEmail}
        </p>
      ) : c.realEmail ? (
        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
          Couldn&apos;t send the email — send the details below instead.
        </p>
      ) : null}

      {/* Login email */}
      <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Login email
          </div>
          <div className="truncate font-mono text-sm">{c.loginEmail}</div>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="shrink-0"
          title="Copy login email"
          onClick={() => copy("email", c.loginEmail)}
        >
          {copied === "email" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>

      {/* Temporary password */}
      <div>
        <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Temporary password
            </div>
            <div className="truncate font-mono text-sm">{c.tempPassword}</div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="shrink-0"
            title="Copy temporary password"
            onClick={() => copy("password", c.tempPassword)}
          >
            {copied === "password" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          They&apos;ll be asked to choose their own password on first login.
        </p>
      </div>

      {/* Send actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        {c.phone ? (
          <Button type="button" variant="outline" size="sm" onClick={sendWhatsApp}>
            <MessageCircle className="h-4 w-4" /> Send via WhatsApp
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={copyAll}>
          {copied === "all" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy all
        </Button>
      </div>
    </div>
  );
}
