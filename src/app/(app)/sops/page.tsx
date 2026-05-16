import Link from "next/link";
import { Plus } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SopFormDialog } from "@/app/(app)/sops/sop-form-dialog";
import { LocalizedText } from "@/components/shared/localized-text";

export const dynamic = "force-dynamic";

export default async function SopsPage({ searchParams }: { searchParams: Promise<{ filter?: "active" | "archived" }> }) {
  const { filter = "active" } = await searchParams;
  const sops = await prisma.sop.findMany({
    where: { status: filter === "active" ? "ACTIVE" : "ARCHIVED" },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">SOPs</h1>
        <SopFormDialog trigger={<Button><Plus className="h-4 w-4" /> New SOP</Button>} />
      </header>

      <Tabs value={filter}>
        <TabsList>
          <TabsTrigger value="active" asChild><Link href="/sops?filter=active">Active</Link></TabsTrigger>
          <TabsTrigger value="archived" asChild><Link href="/sops?filter=archived">Archived</Link></TabsTrigger>
        </TabsList>
      </Tabs>

      {sops.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No SOPs in this filter.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(sops as { id: string; titleEn: string; titleId: string; category: string | null; status: "ACTIVE" | "ARCHIVED"; updatedAt: Date }[]).map((s) => (
            <Link key={s.id} href={`/sops/${s.id}`}>
              <Card className="cursor-pointer transition hover:shadow-md">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-serif"><LocalizedText en={s.titleEn} id={s.titleId} /></CardTitle>
                    <Badge variant={s.status === "ACTIVE" ? "accent" : "secondary"}>{s.status}</Badge>
                  </div>
                  {s.category ? <div className="text-xs text-muted-foreground">{s.category}</div> : null}
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Updated {s.updatedAt.toISOString().slice(0, 10)}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
