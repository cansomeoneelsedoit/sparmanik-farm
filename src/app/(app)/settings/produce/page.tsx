import { prisma } from "@/server/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProduceManager } from "@/app/(app)/settings/produce/produce-manager";

export const dynamic = "force-dynamic";

export default async function ProduceSettingsPage() {
  const produces = await prisma.produce.findMany({ orderBy: { name: "asc" } });
  return (
    <Card>
      <CardHeader><CardTitle>Produce</CardTitle></CardHeader>
      <CardContent>
        <ProduceManager produces={produces.map((p: { id: string; name: string; barcode: string | null }) => ({ id: p.id, name: p.name, barcode: p.barcode }))} />
      </CardContent>
    </Card>
  );
}
