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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createWageEntry } from "@/app/(app)/staff/actions";

const today = () => new Date().toISOString().slice(0, 10);
const schema = z.object({
  staffId: z.string().min(1),
  date: z.string().min(1),
  hours: z.string().regex(/^[0-9.]+$/),
  task: z.string().optional(),
  harvestId: z.string().optional(),
  greenhouseId: z.string().optional(),
});
type Form = z.infer<typeof schema>;

export function NewWageEntryDialog({
  staff,
  harvests,
  greenhouses,
}: {
  staff: { id: string; name: string }[];
  harvests: { id: string; name: string }[];
  greenhouses: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { hours: "0", date: today() } });

  function onSubmit(v: Form) {
    startT(async () => {
      const r = await createWageEntry({
        staffId: v.staffId,
        date: v.date,
        lines: [
          {
            hours: v.hours,
            task: v.task ?? "",
            harvestId: v.harvestId || null,
            greenhouseId: v.greenhouseId || null,
          },
        ],
      });
      if (r.ok) {
        toast.success("Wage entry added");
        setOpen(false);
        form.reset({ hours: "0", date: today() });
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">New wage entry</Button></DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader><DialogTitle>New wage entry</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Staff</Label>
                <Select value={form.watch("staffId") ?? ""} onValueChange={(v) => form.setValue("staffId", v)}>
                  <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Date</Label><Input type="date" {...form.register("date")} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Hours</Label><Input type="number" step="any" min="0" {...form.register("hours")} /></div>
              <div className="space-y-2"><Label>Task</Label><Input {...form.register("task")} placeholder="Pruning melon" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Harvest (optional)</Label>
                <Select value={form.watch("harvestId") ?? ""} onValueChange={(v) => form.setValue("harvestId", v || undefined)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>{harvests.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Greenhouse (optional)</Label>
                <Select value={form.watch("greenhouseId") ?? ""} onValueChange={(v) => form.setValue("greenhouseId", v || undefined)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>{greenhouses.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
