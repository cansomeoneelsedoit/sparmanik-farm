import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

export const dynamic = "force-dynamic";

/**
 * The POS register lives OUTSIDE the (app) layout so it gets the full viewport
 * with no sidebar/topbar — a clean, tablet-first register sheet (same idea as
 * the /print routes). It still guards auth itself, since it doesn't inherit the
 * (app) layout's session check.
 */
export default async function PosLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  // Education-portal logins never operate the register (belt-and-braces with
  // the proxy fence, since this route lives outside the (app) layout).
  if (session.user.role === "PORTAL") redirect("/training");
  return <div className="min-h-screen bg-muted/20">{children}</div>;
}
