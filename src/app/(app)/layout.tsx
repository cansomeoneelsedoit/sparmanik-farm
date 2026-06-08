import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { auth } from "@/auth";
import { availableProviders } from "@/server/ai";
import { prisma } from "@/server/prisma";
import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { EchoWidget } from "@/components/shared/echo-widget";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

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
    </NuqsAdapter>
  );
}
