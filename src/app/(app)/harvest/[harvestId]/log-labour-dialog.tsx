"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { createWageEntry } from "@/app/(app)/staff/actions";
import { createLabourTaskQuick } from "@/app/(app)/settings/actions";

/** Sentinel option representing "type something custom". */
const OTHER_TASK_VALUE = "__other__";

const today = () => new Date().toISOString().slice(0, 10);
const schema = z.object({
  staffId: z.string().min(1, "Pick a staff member"),
  date: z.string().min(1),
  hours: z.string().regex(/^[0-9.]+$/, "Hours"),
  // The displayed task — either a row from the predefined list, or
  // OTHER_TASK_VALUE when the user wants to type their own.
  task: z.string().min(1, "Pick or type a task"),
  // Populated only when `task === OTHER_TASK_VALUE`.
  customTask: z.string().optional(),
});
type Form = z.infer<typeof schema>;

/**
 * Lets the user log labour hours from inside a harvest detail page so the
 * labour cost stat updates without round-tripping through /staff. Task is
 * required and picked from a predefined list (managed under Settings →
 * Labour tasks) — selecting "Other" reveals a free-text input so unusual
 * one-offs aren't blocked.
 */
export function LogLabourDialog({
  harvestId,
  staff,
  tasks,
}: {
  harvestId: string;
  staff: { id: string; name: string; rate: string | null }[];
  tasks: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const [localTasks, setLocalTasks] = useState(tasks);
  const router = useRouter();
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { staffId: "", date: today(), hours: "0", task: "", customTask: "" },
  });

  const taskValue = form.watch("task");
  const isOther = taskValue === OTHER_TASK_VALUE;

  function onSubmit(v: Form) {
    // Resolve display value of task. For the predefined list, the value IS
    // the task name; for "Other" we use whatever the user typed.
    const resolved =
      v.task === OTHER_TASK_VALUE ? (v.customTask ?? "").trim() : v.task;
    if (!resolved) {
      form.setError("customTask", { message: "Type a task or pick from the list" });
      return;
    }
    startT(async () => {
      const r = await createWageEntry({
        staffId: v.staffId,
        date: v.date,
        lines: [
          {
            hours: v.hours,
            task: resolved,
            harvestId,
          },
        ],
      });
      if (r.ok) {
        toast.success("Labour logged");
        setOpen(false);
        form.reset({
          staffId: "",
          date: today(),
          hours: "0",
          task: "",
          customTask: "",
        });
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  async function handleCreateTask(typed: string) {
    const r = await createLabourTaskQuick(typed);
    if (r.ok && r.data) {
      setLocalTasks((prev) => [...prev, { id: r.data!.id, name: r.data!.name }]);
      form.setValue("task", r.data.name);
      toast.success(`Added "${r.data.name}" to the list`);
    } else if (!r.ok) {
      toast.error(r.error);
    }
  }

  const selectedStaff = staff.find((s) => s.id === form.watch("staffId"));
  const hours = Number(form.watch("hours") || 0);
  const rate = selectedStaff?.rate ? Number(selectedStaff.rate) : null;
  const estimatedCost = rate !== null && hours > 0 ? (rate * hours).toFixed(2) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Log labour</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Log labour hours for this harvest</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Staff member</Label>
              <Combobox
                value={form.watch("staffId")}
                onChange={(v) => form.setValue("staffId", v ?? "")}
                placeholder={staff.length === 0 ? "No staff yet — add via /staff" : "Pick staff"}
                options={staff.map((s) => ({
                  value: s.id,
                  label: s.name,
                  description: s.rate ? `${s.rate} / hr` : "no rate set",
                }))}
              />
              {form.formState.errors.staffId ? (
                <p className="text-xs text-destructive">{form.formState.errors.staffId.message}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Hours</Label>
                <Input type="number" step="any" min="0" {...form.register("hours")} />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" {...form.register("date")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>
                Task <span className="text-destructive">*</span>
              </Label>
              <Combobox
                value={taskValue || null}
                onChange={(v) => form.setValue("task", v ?? "")}
                placeholder="Pick a task"
                emptyHint="No matches — type a new name and press Create."
                options={[
                  ...localTasks.map((t) => ({ value: t.name, label: t.name })),
                  { value: OTHER_TASK_VALUE, label: "Other (type below)…" },
                ]}
                onCreate={handleCreateTask}
                createLabel={(typed) => `Add "${typed}" to the list`}
              />
              {form.formState.errors.task ? (
                <p className="text-xs text-destructive">{form.formState.errors.task.message}</p>
              ) : null}
              {isOther ? (
                <Input
                  {...form.register("customTask")}
                  placeholder="What did they do? (e.g. tied up melon vines)"
                  autoFocus
                />
              ) : null}
              {form.formState.errors.customTask ? (
                <p className="text-xs text-destructive">{form.formState.errors.customTask.message}</p>
              ) : null}
              <p className="text-[10px] text-muted-foreground">
                Manage the list under{" "}
                <a href="/settings/labour-tasks" className="underline" target="_blank">
                  Settings → Labour tasks
                </a>
                .
              </p>
            </div>
            {estimatedCost ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Estimated cost at current rate: <strong className="text-foreground">{estimatedCost}</strong>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Log labour"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
