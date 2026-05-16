"use client";

import { useState, useTransition, type ReactNode } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createTask } from "@/app/(app)/tasks/actions";

const today = () => new Date().toISOString().slice(0, 10);
const schema = z.object({
  title: z.string().min(1),
  dueDate: z.string().min(1),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  assigneeStaffId: z.string().optional(),
  harvestId: z.string().optional(),
  description: z.string().optional(),
});
type Form = z.infer<typeof schema>;

export function AddTaskDialog({
  trigger,
  staff,
  harvests,
}: {
  trigger: ReactNode;
  staff: { id: string; name: string }[];
  harvests: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", dueDate: today(), priority: "MEDIUM" },
  });

  function onSubmit(v: Form) {
    startT(async () => {
      const r = await createTask({
        ...v,
        assigneeStaffId: v.assigneeStaffId || null,
        harvestId: v.harvestId || null,
      });
      if (r.ok) {
        toast.success("Task added");
        setOpen(false);
        form.reset({ title: "", dueDate: today(), priority: "MEDIUM" });
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader><DialogTitle>Add task</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input {...form.register("title")} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Due date</Label>
                <Input type="date" {...form.register("dueDate")} />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.watch("priority")} onValueChange={(v) => form.setValue("priority", v as "LOW" | "MEDIUM" | "HIGH")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Assignee</Label>
                <Select value={form.watch("assigneeStaffId") ?? ""} onValueChange={(v) => form.setValue("assigneeStaffId", v || undefined)}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Harvest (optional)</Label>
                <Select value={form.watch("harvestId") ?? ""} onValueChange={(v) => form.setValue("harvestId", v || undefined)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    {harvests.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={3} {...form.register("description")} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
