"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInvite } from "@/app/(auth)/account-actions";

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-destructive">
          This link is missing its code. Ask Sparmanik Farm for a new invite.
          <br />
          <span className="italic">Tautan tidak lengkap. Minta undangan baru.</span>
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/signin">Go to sign in · Ke halaman masuk</Link>
        </Button>
      </div>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pw.length < 8) {
      setError("Use at least 8 characters · Minimal 8 karakter");
      return;
    }
    if (pw !== confirm) {
      setError("The passwords don't match · Kata sandi tidak cocok");
      return;
    }
    setError(null);
    start(async () => {
      const r = await acceptInvite({ token, password: pw });
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      // Log them straight in with the password they just chose.
      const res = await signIn("credentials", {
        email: r.data?.email ?? "",
        password: pw,
        redirect: false,
      });
      if (res?.error) {
        toast.success("Password set — please sign in.");
        router.replace("/signin");
        return;
      }
      toast.success("Welcome!");
      router.replace("/training");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pw">Choose a password · Buat kata sandi</Label>
        <Input
          id="pw"
          type="password"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm password · Ulangi kata sandi</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Setting up…" : "Start learning · Mulai belajar"}
      </Button>
    </form>
  );
}
