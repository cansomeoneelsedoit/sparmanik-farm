import { prisma } from "@/server/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LabourTaskManager } from "@/app/(app)/settings/labour-tasks/labour-task-manager";

export const dynamic = "force-dynamic";

export default async function LabourTasksSettingsPage() {
  const tasks = await prisma.labourTask.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Labour tasks</CardTitle>
        <p className="text-xs text-muted-foreground">
          These show up as the dropdown choices when someone logs labour hours
          on a greenhouse harvest. Rename, archive, or add your own — staff
          can still pick &ldquo;Other&rdquo; and type a custom one when needed.
        </p>
      </CardHeader>
      <CardContent>
        <LabourTaskManager
          tasks={tasks.map(
            (t: { id: string; name: string; sortOrder: number; active: boolean }) => ({
              id: t.id,
              name: t.name,
              sortOrder: t.sortOrder,
              active: t.active,
            }),
          )}
        />
      </CardContent>
    </Card>
  );
}
