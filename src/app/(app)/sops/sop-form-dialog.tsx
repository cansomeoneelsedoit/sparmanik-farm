"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
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
import { createSop, updateSop } from "@/app/(app)/sops/actions";

const schema = z.object({
  titleEn: z.string().min(1),
  titleId: z.string().min(1),
  descriptionEn: z.string().optional(),
  descriptionId: z.string().optional(),
  category: z.string().optional(),
  steps: z.array(z.object({ bodyEn: z.string().min(1), bodyId: z.string().min(1) })).default([]),
});
type Form = z.infer<typeof schema>;

export function SopFormDialog({
  trigger,
  existing,
}: {
  trigger: ReactNode;
  existing?: { id: string; titleEn: string; titleId: string; descriptionEn: string | null; descriptionId: string | null; category: string | null; steps: { bodyEn: string; bodyId: string }[] };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();
  const isEdit = !!existing;
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      titleEn: existing?.titleEn ?? "",
      titleId: existing?.titleId ?? "",
      descriptionEn: existing?.descriptionEn ?? "",
      descriptionId: existing?.descriptionId ?? "",
      category: existing?.category ?? "",
      steps: existing?.steps ?? [{ bodyEn: "", bodyId: "" }],
    },
  });
  const steps = useFieldArray({ control: form.control, name: "steps" });

  function onSubmit(v: Form) {
    startT(async () => {
      const r = isEdit ? await updateSop(existing.id, v) : await createSop(v);
      if (r.ok) {
        toast.success(isEdit ? "Saved" : "Created");
        setOpen(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader><DialogTitle>{isEdit ? "Edit SOP" : "New SOP"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Title (EN)</Label><Input {...form.register("titleEn")} /></div>
              <div className="space-y-2"><Label>Title (ID)</Label><Input {...form.register("titleId")} /></div>
            </div>
            <div className="space-y-2"><Label>Category</Label><Input {...form.register("category")} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Description (EN)</Label><Textarea rows={2} {...form.register("descriptionEn")} /></div>
              <div className="space-y-2"><Label>Description (ID)</Label><Textarea rows={2} {...form.register("descriptionId")} /></div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Steps</Label>
                <Button type="button" size="sm" variant="ghost" onClick={() => steps.append({ bodyEn: "", bodyId: "" })}>+ Add</Button>
              </div>
              {steps.fields.map((field, i) => (
                <div key={field.id} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Step {i + 1}</span>
                    <Button type="button" size="icon" variant="ghost" onClick={() => steps.remove(i)}>×</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Textarea rows={2} placeholder="EN" {...form.register(`steps.${i}.bodyEn`)} />
                    <Textarea rows={2} placeholder="ID" {...form.register(`steps.${i}.bodyId`)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
