import { Plus } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddTaskDialog } from "@/app/(app)/tasks/add-task-dialog";
import { TaskCard } from "@/app/(app)/tasks/task-card";

export const dynamic = "force-dynamic";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  dueDate: Date;
  assigneeStaffId: string | null;
  assignee: { id: string; name: string } | null;
  harvest: { id: string; name: string } | null;
};

export default async function TasksPage() {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [tasks, staff, harvests] = await Promise.all([
    prisma.task.findMany({
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      include: { assignee: true, harvest: { select: { id: true, name: true } } },
    }),
    prisma.staff.findMany({ orderBy: { name: "asc" } }),
    prisma.harvest.findMany({ where: { status: "LIVE" }, select: { id: true, name: true } }),
  ]);

  const rows = tasks as TaskRow[];
  const overdue = rows.filter((t) => t.status !== "COMPLETED" && t.dueDate < today);
  const dueToday = rows.filter((t) => t.status !== "COMPLETED" && t.dueDate.toISOString().slice(0, 10) === today.toISOString().slice(0, 10));
  const upcoming = rows.filter((t) => t.status !== "COMPLETED" && t.dueDate > today);
  const completed = rows.filter((t) => t.status === "COMPLETED");

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">Tasks</h1>
        <AddTaskDialog
          staff={staff.map((s: { id: string; name: string }) => s)}
          harvests={harvests.map((h: { id: string; name: string }) => h)}
          trigger={<Button><Plus className="h-4 w-4" /> Add task</Button>}
        />
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Overdue" count={overdue.length} accent="red" />
        <Stat label="Due today" count={dueToday.length} accent="yellow" />
        <Stat label="Upcoming" count={upcoming.length} accent="blue" />
        <Stat label="Completed" count={completed.length} accent="green" />
      </div>

      <Section title="Overdue" border="border-l-destructive" tasks={overdue} staff={staff} />
      <Section title="Due today" border="border-l-yellow-500" tasks={dueToday} staff={staff} />
      <Section title="Upcoming" border="border-l-blue-500" tasks={upcoming} staff={staff} />
      <Section title="Completed" border="border-l-green-500" tasks={completed} staff={staff} muted />
    </div>
  );
}

function Stat({ label, count, accent }: { label: string; count: number; accent: "red" | "yellow" | "blue" | "green" }) {
  const colour = accent === "red" ? "text-destructive" : accent === "yellow" ? "text-yellow-600" : accent === "blue" ? "text-blue-600" : "text-green-600";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold ${colour}`}>{count}</div>
      </CardContent>
    </Card>
  );
}

function Section({ title, border, tasks, staff, muted }: { title: string; border: string; tasks: TaskRow[]; staff: { id: string; name: string }[]; muted?: boolean }) {
  if (tasks.length === 0) return null;
  return (
    <Card className={`border-l-4 ${border} ${muted ? "opacity-70" : ""}`}>
      <CardHeader>
        <CardTitle className="text-base">{title} <Badge variant="secondary" className="ml-2">{tasks.length}</Badge></CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {tasks.map((t) => <TaskCard key={t.id} task={t} staff={staff} />)}
      </CardContent>
    </Card>
  );
}
