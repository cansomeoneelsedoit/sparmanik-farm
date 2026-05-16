import { prisma } from "@/server/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GreenhouseManager } from "@/app/(app)/settings/greenhouses/greenhouse-manager";

export const dynamic = "force-dynamic";

export default async function GreenhousesSettingsPage() {
  const greenhouses = await prisma.greenhouse.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { harvests: true } } },
  });
  return (
    <Card>
      <CardHeader><CardTitle>Greenhouses</CardTitle></CardHeader>
      <CardContent>
        <GreenhouseManager
          greenhouses={greenhouses.map((g: { id: string; name: string; location: string | null; type: string | null; _count: { harvests: number } }) => ({
            id: g.id,
            name: g.name,
            location: g.location,
            type: g.type,
            harvestCount: g._count.harvests,
          }))}
        />
      </CardContent>
    </Card>
  );
}
