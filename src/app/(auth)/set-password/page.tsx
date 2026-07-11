import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { SetPasswordForm } from "./set-password-form";

export const dynamic = "force-dynamic";

/**
 * Forced first-login password change. The proxy sends any signed-in user with
 * mustChangePassword=true here (temp-password students) and lets them reach
 * nothing else until they choose their own password.
 */
export default async function SetPasswordPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="font-serif text-2xl">Choose your password</h1>
        <p className="text-sm text-muted-foreground">
          Set a password you&apos;ll remember, then you&apos;re in.
          <br />
          <span className="italic">Buat kata sandi Anda, lalu Anda bisa masuk.</span>
        </p>
      </div>
      <SetPasswordForm email={session.user.email ?? ""} />
    </div>
  );
}
