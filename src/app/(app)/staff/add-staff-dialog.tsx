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
import { createStaff, updateStaff } from "@/app/(app)/staff/actions";

const today = () => new Date().toISOString().slice(0, 10);
const newSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  rate: z.string().regex(/^[0-9.]+$/),
  effectiveFrom: z.string().min(1),
});
const editSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  avatar: z.string().optional(),
});
type NewForm = z.infer<typeof newSchema>;
type EditForm = z.infer<typeof editSchema>;

export function AddStaffDialog({
  trigger,
  existing,
}: {
  trigger: ReactNode;
  existing?: { id: string; name: string; role: string | null; avatar: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();
  const isEdit = !!existing;
  const newForm = useForm<NewForm>({
    resolver: zodResolver(newSchema),
    defaultValues: { name: "", rate: "0", effectiveFrom: today() },
  });
  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: existing?.name ?? "",
      role: existing?.role ?? "",
      avatar: existing?.avatar ?? "",
    },
  });

  function onCreate(v: NewForm) {
    startT(async () => {
      const r = await createStaff(v);
      if (r.ok) {
        toast.success("Staff added");
        setOpen(false);
        newForm.reset();
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function onEdit(v: EditForm) {
    if (!existing) return;
    startT(async () => {
      const r = await updateStaff(existing.id, v);
      if (r.ok) {
        toast.success("Saved");
        setOpen(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {isEdit ? (
          <form onSubmit={editForm.handleSubmit(onEdit)}>
            <DialogHeader><DialogTitle>Edit staff</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Name</Label><Input {...editForm.register("name")} autoFocus /></div>
              <div className="space-y-2"><Label>Role</Label><Input {...editForm.register("role")} /></div>
              <div className="space-y-2"><Label>Avatar (2 letters)</Label><Input {...editForm.register("avatar")} maxLength={3} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={newForm.handleSubmit(onCreate)}>
            <DialogHeader><DialogTitle>Add staff</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Name</Label><Input {...newForm.register("name")} autoFocus /></div>
              <div className="space-y-2"><Label>Role</Label><Input {...newForm.register("role")} placeholder="Field lead / Harvester" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Starting rate (IDR/hr)</Label><Input type="number" step="any" min="0" {...newForm.register("rate")} /></div>
                <div className="space-y-2"><Label>Effective from</Label><Input type="date" {...newForm.register("effectiveFrom")} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
