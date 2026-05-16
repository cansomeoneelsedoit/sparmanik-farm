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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { startHarvest, updateHarvest } from "@/app/(app)/harvest/actions";

const today = () => new Date().toISOString().slice(0, 10);
const schema = z.object({
  name: z.string().min(1),
  greenhouseId: z.string().min(1),
  produceId: z.string().optional(),
  variety: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  status: z.enum(["LIVE", "CLOSED"]).optional(),
});
type Form = z.infer<typeof schema>;

export function StartHarvestDialog({
  trigger,
  greenhouses,
  produces,
  existing,
}: {
  trigger: ReactNode;
  greenhouses: { id: string; name: string }[];
  produces: { id: string; name: string }[];
  existing?: {
    id: string;
    name: string;
    greenhouseId: string;
    produceId: string | null;
    variety: string | null;
    startDate: string;
    endDate: string | null;
    status: "LIVE" | "CLOSED";
  };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();
  const isEdit = !!existing;
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: existing
      ? {
          name: existing.name,
          greenhouseId: existing.greenhouseId,
          produceId: existing.produceId ?? undefined,
          variety: existing.variety ?? "",
          startDate: existing.startDate,
          endDate: existing.endDate ?? "",
          status: existing.status,
        }
      : { name: "", startDate: today() },
  });

  function onSubmit(v: Form) {
    startT(async () => {
      if (isEdit) {
        const r = await updateHarvest(existing.id, {
          ...v,
          produceId: v.produceId || null,
          endDate: v.endDate || null,
          status: v.status ?? "LIVE",
        });
        if (r.ok) { toast.success("Saved"); setOpen(false); router.refresh(); }
        else toast.error(r.error);
      } else {
        const r = await startHarvest({ ...v, produceId: v.produceId || null });
        if (r.ok) {
          toast.success("Harvest started");
          setOpen(false);
          form.reset({ name: "", startDate: today() });
          router.refresh();
        } else toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader><DialogTitle>{isEdit ? "Edit harvest" : "Start harvest"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input {...form.register("name")} placeholder="Melon GH1 Round 4" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Greenhouse</Label>
                <Select value={form.watch("greenhouseId") ?? ""} onValueChange={(v) => form.setValue("greenhouseId", v)}>
                  <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                  <SelectContent>
                    {greenhouses.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Produce</Label>
                <Select value={form.watch("produceId") ?? ""} onValueChange={(v) => form.setValue("produceId", v || undefined)}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {produces.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Variety</Label>
                <Input {...form.register("variety")} placeholder="Yellow Melon" />
              </div>
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input type="date" {...form.register("startDate")} />
              </div>
            </div>
            {isEdit ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>End date</Label>
                  <Input type="date" {...form.register("endDate")} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.watch("status")} onValueChange={(v) => form.setValue("status", v as "LIVE" | "CLOSED")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LIVE">Live</SelectItem>
                      <SelectItem value="CLOSED">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save" : "Start"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
