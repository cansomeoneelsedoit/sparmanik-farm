import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { auth } from "@/auth";
import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  return (
    <NuqsAdapter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar userName={session.user.name ?? session.user.email ?? null} />
          <main className="flex-1 overflow-auto bg-muted/20 p-6">{children}</main>
        </div>
      </div>
    </NuqsAdapter>
  );
}
