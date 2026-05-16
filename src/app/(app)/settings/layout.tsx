import Link from "next/link";
import type { ReactNode } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">Settings</h1>
      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories" asChild><Link href="/settings/categories">Categories</Link></TabsTrigger>
          <TabsTrigger value="produce" asChild><Link href="/settings/produce">Produce</Link></TabsTrigger>
          <TabsTrigger value="greenhouses" asChild><Link href="/settings/greenhouses">Greenhouses</Link></TabsTrigger>
          <TabsTrigger value="staff" asChild><Link href="/settings/staff">Staff</Link></TabsTrigger>
          <TabsTrigger value="general" asChild><Link href="/settings/general">General</Link></TabsTrigger>
        </TabsList>
      </Tabs>
      {children}
    </div>
  );
}
