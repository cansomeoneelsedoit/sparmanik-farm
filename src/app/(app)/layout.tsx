import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { auth } from "@/auth";
import { availableProviders } from "@/server/ai";
import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { EchoWidget } from "@/components/shared/echo-widget";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const echoEnabled = availableProviders().length > 0;
  const isSuperuser = session.user.role === "SUPERUSER";

  return (
    <NuqsAdapter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar isSuperuser={isSuperuser} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar userName={session.user.name ?? session.user.email ?? null} />
          <main className="flex-1 overflow-auto bg-muted/20 p-6">{children}</main>
        </div>
      </div>
      {echoEnabled ? <EchoWidget /> : null}
    </NuqsAdapter>
  );
}
