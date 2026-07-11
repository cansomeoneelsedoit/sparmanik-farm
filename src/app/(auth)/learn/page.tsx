import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LearnLoginForm } from "./learn-login-form";

export const dynamic = "force-dynamic";

/**
 * Dedicated STUDENT login door — the education portal's own front page, kept
 * separate from the staff/admin /signin. Students never need to see (or be
 * handed) the farm-management login. Note the actual access wall is the PORTAL
 * role fence in the proxy — a portal account can only ever reach /training*
 * regardless of which login page it used; this page is the clean, shareable
 * entry point for it (email + password only, no Google SSO).
 *
 * Anyone can use this door — admins/staff sign in here with their own logins
 * with no issue (superusers bypass the fences) — and everyone who comes through
 * it lands in the learning portal (/training), so an admin can use the portal
 * from here too. They can still reach admin pages via the sidebar afterwards.
 */
export default async function LearnLoginPage() {
  const session = await auth();
  // Already signed in? Skip the form — this is the portal door, so send them
  // straight into the portal (a temp-password student is intercepted to
  // /set-password by the proxy first).
  if (session?.user) {
    redirect("/training");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-accent font-serif text-2xl text-accent-foreground">
          S
        </div>
        <h1 className="font-serif text-2xl">Sparmanik Farm Learning</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to your courses.
          <br />
          <span className="italic">Masuk untuk mengakses kursus Anda.</span>
        </p>
      </div>
      <LearnLoginForm />
    </div>
  );
}
