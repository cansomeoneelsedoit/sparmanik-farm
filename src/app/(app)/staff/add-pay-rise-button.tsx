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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addStaffRate } from "@/app/(app)/staff/actions";

const today = () => new Date().toISOString().slice(0, 10);
const schema = z.object({
  rate: z.string().regex(/^[0-9.]+$/),
  effectiveFrom: z.string().min(1),
});
type Form = z.infer<typeof schema>;

export function AddPayRiseButton({ staffId }: { staffId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { rate: "0", effectiveFrom: today() } });

  function onSubmit(v: Form) {
    startT(async () => {
      const r = await addStaffRate({ staffId, ...v });
      if (r.ok) {
        toast.success("Pay rise added");
        setOpen(false);
        form.reset({ rate: "0", effectiveFrom: today() });
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" className="w-full" onClick={() => setOpen(true)}>Add pay rise</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader><DialogTitle>Add pay rise</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>New rate (IDR/hr)</Label><Input type="number" step="any" min="0" {...form.register("rate")} /></div>
                <div className="space-y-2"><Label>Effective from</Label><Input type="date" {...form.register("effectiveFrom")} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
