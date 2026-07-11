"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Student login form (credentials only — no Google). On success everyone lands
 * in the learning portal (/training) — this IS the portal door, so admins/staff
 * signing in here go into the portal too (they can still reach admin pages via
 * the sidebar). A temp-password student is intercepted to /set-password by the
 * proxy before they get there.
 */
export function LearnLoginForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setError(null);
    start(async () => {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        const msg = "That email or password isn't right · Email atau kata sandi salah";
        setError(msg);
        toast.error(msg);
        return;
      }
      // Land in the portal. The proxy sends a temp-password student to
      // /set-password first; everyone else (students, admins) lands on courses.
      router.replace("/training");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password · Kata sandi</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in · Masuk"}
      </Button>
    </form>
  );
}
