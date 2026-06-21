import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("tasks");
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [tasks, staff, harvests] = await Promise.all([
    prisma.task.findMany({
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        status: true,
        dueDate: true,
        assigneeStaffId: true,
        assignee: { select: { id: true, name: true } },
        harvest: { select: { id: true, name: true } },
      },
    }),
    prisma.staff.findMany({ orderBy: { name: "asc" } }),
    prisma.harvest.findMany({ where: { status: "LIVE" }, select: { id: true, name: true } }),
  ]);

  const rows = tasks as TaskRow[];
  const staffList = staff.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }));
  const harvestList = harvests.map((h: { id: string; name: string }) => ({ id: h.id, name: h.name }));
  const overdue = rows.filter((t) => t.status !== "COMPLETED" && t.dueDate < today);
  const dueToday = rows.filter((t) => t.status !== "COMPLETED" && t.dueDate.toISOString().slice(0, 10) === today.toISOString().slice(0, 10));
  const upcoming = rows.filter((t) => t.status !== "COMPLETED" && t.dueDate > today);
  const completed = rows.filter((t) => t.status === "COMPLETED");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl">{t("title")}</h1>
        <AddTaskDialog
          staff={staff.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))}
          harvests={harvests.map((h: { id: string; name: string }) => ({ id: h.id, name: h.name }))}
          trigger={<Button><Plus className="h-4 w-4" /> {t("addTask")}</Button>}
        />
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label={t("overdue")} count={overdue.length} accent="red" />
        <Stat label={t("dueToday")} count={dueToday.length} accent="yellow" />
        <Stat label={t("upcoming")} count={upcoming.length} accent="blue" />
        <Stat label={t("completed")} count={completed.length} accent="green" />
      </div>

      <Section title={t("overdue")} border="border-l-destructive" tasks={overdue} staff={staffList} harvests={harvestList} />
      <Section title={t("dueToday")} border="border-l-yellow-500" tasks={dueToday} staff={staffList} harvests={harvestList} />
      <Section title={t("upcoming")} border="border-l-blue-500" tasks={upcoming} staff={staffList} harvests={harvestList} />
      <Section title={t("completed")} border="border-l-green-500" tasks={completed} staff={staffList} harvests={harvestList} muted />
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

function Section({ title, border, tasks, staff, harvests, muted }: { title: string; border: string; tasks: TaskRow[]; staff: { id: string; name: string }[]; harvests: { id: string; name: string }[]; muted?: boolean }) {
  if (tasks.length === 0) return null;
  return (
    <Card className={`border-l-4 ${border} ${muted ? "opacity-70" : ""}`}>
      <CardHeader>
        <CardTitle className="text-base">{title} <Badge variant="secondary" className="ml-2">{tasks.length}</Badge></CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {tasks.map((t) => <TaskCard key={t.id} task={t} staff={staff} harvests={harvests} />)}
      </CardContent>
    </Card>
  );
}
