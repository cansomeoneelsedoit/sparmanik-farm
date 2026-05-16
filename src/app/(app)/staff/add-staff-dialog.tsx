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
import { createStaff } from "@/app/(app)/staff/actions";

const today = () => new Date().toISOString().slice(0, 10);
const schema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  rate: z.string().regex(/^[0-9.]+$/),
  effectiveFrom: z.string().min(1),
});
type Form = z.infer<typeof schema>;

export function AddStaffDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", rate: "0", effectiveFrom: today() },
  });

  function onSubmit(v: Form) {
    startT(async () => {
      const r = await createStaff(v);
      if (r.ok) {
        toast.success("Staff added");
        setOpen(false);
        form.reset();
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
          <DialogHeader><DialogTitle>Add staff</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Name</Label><Input {...form.register("name")} autoFocus /></div>
            <div className="space-y-2"><Label>Role</Label><Input {...form.register("role")} placeholder="Field lead / Harvester" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Starting rate (IDR/hr)</Label><Input type="number" step="any" min="0" {...form.register("rate")} /></div>
              <div className="space-y-2"><Label>Effective from</Label><Input type="date" {...form.register("effectiveFrom")} /></div>
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
