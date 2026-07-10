import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { auth, signOut } from "@/auth";
import { availableProviders } from "@/server/ai";
import { prisma } from "@/server/prisma";
import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { EchoWidget } from "@/components/shared/echo-widget";
import { CommandPalette } from "@/components/shared/command-palette";
import { LangToggle } from "@/components/shared/lang-toggle";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  // PORTAL logins (outside learners) get a SLIM chrome: no sidebar, no farm
  // topbar (alerts, audit history, org switcher, exchange rate) — just the app
  // name, the language toggle and sign-out. The path fence keeping them inside
  // /training* lives in src/proxy.ts (a layout can't read the pathname); this
  // branch only decides what chrome renders around the pages they CAN reach.
  if (session.user.role === "PORTAL") {
    const tCommon = await getTranslations("common");
    return (
      <NuqsAdapter>
        <div className="flex h-screen flex-col overflow-hidden">
          <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent font-serif text-accent-foreground">
                S
              </div>
              <span className="truncate text-sm font-semibold">{tCommon("appName")}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <LangToggle />
              <form action={doSignOut}>
                <Button size="sm" variant="ghost" className="px-2 sm:px-3">
                  {tCommon("signOut")}
                </Button>
              </form>
            </div>
          </header>
          <main className="flex-1 overflow-auto bg-muted/20 p-3 sm:p-6">{children}</main>
        </div>
      </NuqsAdapter>
    );
  }

  const echoEnabled = availableProviders().length > 0;
  const isSuperuser = session.user.role === "SUPERUSER";

  // Pulled at layout time so the sidebar can render a count chip beside the
  // "Tasks" entry. Cheap — single count query, force-dynamic anyway.
  const openTaskCount = await prisma.task.count({
    where: { status: { not: "COMPLETED" } },
  });

  return (
    <NuqsAdapter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar isSuperuser={isSuperuser} openTaskCount={openTaskCount} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar
            userName={session.user.name ?? session.user.email ?? null}
            isSuperuser={isSuperuser}
            openTaskCount={openTaskCount}
          />
          {/* Reduce padding on mobile (p-3) so content gets more usable
              width — full p-6 only kicks in at sm+ (640px). */}
          <main className="flex-1 overflow-auto bg-muted/20 p-3 sm:p-6">{children}</main>
        </div>
      </div>
      {echoEnabled ? <EchoWidget /> : null}
      {/* Global Ctrl+K search — mounted once, opened from anywhere via
          hotkey or the topbar trigger. */}
      <CommandPalette />
    </NuqsAdapter>
  );
}
