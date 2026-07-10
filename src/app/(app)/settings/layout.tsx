import Link from "next/link";
import type { ReactNode } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">Settings</h1>
      <Tabs defaultValue="categories">
        {/* Scroll the tab strip on narrow screens so the last tabs (AI keys,
            General) stay reachable on a phone (app review UX). */}
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList className="w-max">
            <TabsTrigger value="categories" asChild><Link href="/settings/categories">Categories</Link></TabsTrigger>
          <TabsTrigger value="produce" asChild><Link href="/settings/produce">Produce</Link></TabsTrigger>
          <TabsTrigger value="greenhouses" asChild><Link href="/settings/greenhouses">Greenhouses</Link></TabsTrigger>
          <TabsTrigger value="staff" asChild><Link href="/settings/staff">Staff</Link></TabsTrigger>
          <TabsTrigger value="labour-tasks" asChild><Link href="/settings/labour-tasks">Labour tasks</Link></TabsTrigger>
          <TabsTrigger value="ai-keys" asChild><Link href="/settings/ai-keys">AI keys</Link></TabsTrigger>
          <TabsTrigger value="email" asChild><Link href="/settings/email">Email</Link></TabsTrigger>
            <TabsTrigger value="general" asChild><Link href="/settings/general">General</Link></TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      {children}
    </div>
  );
}
