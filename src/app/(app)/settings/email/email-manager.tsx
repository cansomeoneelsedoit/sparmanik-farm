"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Mail, Send, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteMailAccount,
  saveMailAccount,
  sendTestMail,
  setMailAccountEnabled,
} from "./actions";

type MaskedAccount = {
  id: string;
  email: string;
  maskedPassword: string;
  enabled: boolean;
  lastStatus: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
};

/**
 * Single-account manager (one outgoing Gmail per farm). The app password is
 * write-only: the form shows a masked placeholder once saved; typing a new one
 * replaces it, leaving it blank keeps it.
 */
export function EmailManager({ account }: { account: MaskedAccount | null }) {
  const router = useRouter();
  const [email, setEmail] = useState(account?.email ?? "");
  const [password, setPassword] = useState("");
  const [pending, startT] = useTransition();

  function save() {
    startT(async () => {
      const r = await saveMailAccount({ email, appPassword: password });
      if (r.ok) {
        toast.success("Email account saved");
        setPassword("");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function test() {
    startT(async () => {
      const r = await sendTestMail();
      if (r.ok) toast.success(`Test sent — check ${account?.email}`);
      else toast.error(r.error);
      router.refresh();
    });
  }

  function toggle() {
    if (!account) return;
    startT(async () => {
      const r = await setMailAccountEnabled(account.id, !account.enabled);
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  }

  function remove() {
    if (!account) return;
    if (!window.confirm("Remove this email account? Receipt emailing stops working.")) return;
    startT(async () => {
      const r = await deleteMailAccount(account.id);
      if (r.ok) {
        toast.success("Removed");
        setEmail("");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {account ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{account.email}</span>
          <span className="font-mono text-xs text-muted-foreground">{account.maskedPassword}</span>
          {account.lastStatus === "ok" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> working
            </span>
          ) : account.lastStatus === "error" ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
              title={account.lastError ?? undefined}
            >
              <XCircle className="h-3 w-3" /> failed
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              untested
            </span>
          )}
          {!account.enabled ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              disabled
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={test} disabled={pending || !account.enabled}>
              <Send className="mr-1 h-3.5 w-3.5" /> Test
            </Button>
            <Button size="sm" variant="ghost" onClick={toggle} disabled={pending}>
              {account.enabled ? "Disable" : "Enable"}
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={remove} disabled={pending}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Gmail address</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="sparamanikfarm@gmail.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">
            App Password{" "}
            {account ? (
              <span className="font-normal text-muted-foreground">(blank = keep current)</span>
            ) : null}
          </Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="xxxx xxxx xxxx xxxx"
            autoComplete="new-password"
          />
        </div>
      </div>
      <Button onClick={save} disabled={pending || email.trim() === ""}>
        {pending ? "Saving…" : account ? "Update" : "Save"}
      </Button>
    </div>
  );
}
