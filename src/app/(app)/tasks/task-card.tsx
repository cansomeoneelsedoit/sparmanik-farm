"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setTaskStatus, assignTask, deleteTask } from "@/app/(app)/tasks/actions";

type Task = {
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

export function TaskCard({ task, staff }: { task: Task; staff: { id: string; name: string }[] }) {
  const [pending, startT] = useTransition();
  const router = useRouter();
  const priorityColour = task.priority === "HIGH" ? "destructive" : task.priority === "MEDIUM" ? "accent" : "secondary";
  const checked = task.status === "COMPLETED";

  return (
    <div className="flex items-start gap-3 rounded-md border bg-background p-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(e) =>
          startT(async () => {
            const r = await setTaskStatus(task.id, e.target.checked ? "COMPLETED" : "PENDING");
            if (r.ok) router.refresh();
            else toast.error(r.error);
          })
        }
        className="mt-1"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <div className={`font-medium ${checked ? "line-through text-muted-foreground" : ""}`}>{task.title}</div>
          <Badge variant={priorityColour as "destructive" | "accent" | "secondary"}>{task.priority}</Badge>
          {task.harvest ? <Badge variant="outline">{task.harvest.name}</Badge> : null}
        </div>
        {task.description ? <div className="mt-1 text-xs text-muted-foreground">{task.description}</div> : null}
        <div className="mt-1 text-xs text-muted-foreground">Due {task.dueDate.toISOString().slice(0, 10)}</div>
      </div>
      <Select
        value={task.assigneeStaffId ?? ""}
        onValueChange={(v) =>
          startT(async () => {
            const r = await assignTask(task.id, v || null);
            if (r.ok) router.refresh();
            else toast.error(r.error);
          })
        }
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button
        size="icon"
        variant="ghost"
        onClick={() =>
          startT(async () => {
            const r = await deleteTask(task.id);
            if (r.ok) {
              toast.success("Deleted");
              router.refresh();
            } else toast.error(r.error);
          })
        }
        title="Delete"
      >
        ×
      </Button>
    </div>
  );
}
