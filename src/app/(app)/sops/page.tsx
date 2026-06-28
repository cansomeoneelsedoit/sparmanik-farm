import Link from "next/link";
import { Plus } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SopFormDialog } from "@/app/(app)/sops/sop-form-dialog";
import { SopsBrowser } from "@/app/(app)/sops/sops-browser";

export const dynamic = "force-dynamic";

export default async function SopsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: "active" | "archived" }>;
}) {
  const { filter = "active" } = await searchParams;
  const sops = await prisma.sop.findMany({
    where: { status: filter === "active" ? "ACTIVE" : "ARCHIVED" },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl">SOPs</h1>
        <SopFormDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> New SOP
            </Button>
          }
        />
      </header>

      <Tabs value={filter}>
        <TabsList>
          <TabsTrigger value="active" asChild>
            <Link href="/sops?filter=active">Active</Link>
          </TabsTrigger>
          <TabsTrigger value="archived" asChild>
            <Link href="/sops?filter=archived">Archived</Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <SopsBrowser
        sops={(sops as {
          id: string;
          titleEn: string;
          titleId: string;
          category: string | null;
          status: "ACTIVE" | "ARCHIVED";
          updatedAt: Date;
        }[]).map((s) => ({
          id: s.id,
          titleEn: s.titleEn,
          titleId: s.titleId,
          category: s.category,
          status: s.status,
          updatedAt: s.updatedAt.toISOString().slice(0, 10),
        }))}
      />
    </div>
  );
}
