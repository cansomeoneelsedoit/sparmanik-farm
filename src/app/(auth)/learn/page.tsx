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
 */
export default async function LearnLoginPage() {
  const session = await auth();
  // Already signed in? Don't show a login form — send them where they belong.
  if (session?.user) {
    redirect(session.user.role === "PORTAL" ? "/training" : "/");
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
