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
import { createRecipe, updateRecipe } from "@/app/(app)/recipes/actions";

const schema = z.object({
  name: z.string().min(1),
  crop: z.string().optional(),
  stage: z.string().optional(),
  ec: z.string().optional(),
  ph: z.string().optional(),
  notes: z.string().optional(),
  ingredients: z.array(z.object({ name: z.string().min(1), amount: z.string().min(1) })).default([]),
});
type Form = z.infer<typeof schema>;

export function RecipeFormDialog({
  trigger,
  existing,
}: {
  trigger: ReactNode;
  existing?: { id: string; name: string; crop: string | null; stage: string | null; ec: string | null; ph: string | null; notes: string | null; ingredients: { name: string; amount: string }[] };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();
  const isEdit = !!existing;
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: existing?.name ?? "",
      crop: existing?.crop ?? "",
      stage: existing?.stage ?? "",
      ec: existing?.ec ?? "",
      ph: existing?.ph ?? "",
      notes: existing?.notes ?? "",
      ingredients: existing?.ingredients ?? [{ name: "", amount: "" }],
    },
  });
  const ingArr = useFieldArray({ control: form.control, name: "ingredients" });

  function onSubmit(v: Form) {
    startT(async () => {
      const r = isEdit ? await updateRecipe(existing.id, v) : await createRecipe(v);
      if (r.ok) {
        toast.success(isEdit ? "Recipe saved" : "Recipe created");
        setOpen(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader><DialogTitle>{isEdit ? "Edit recipe" : "New recipe"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Name</Label><Input {...form.register("name")} autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Crop</Label><Input {...form.register("crop")} /></div>
              <div className="space-y-2"><Label>Stage</Label><Input {...form.register("stage")} placeholder="Vegetative / Generative" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>EC target (mS/cm)</Label><Input type="number" step="any" {...form.register("ec")} /></div>
              <div className="space-y-2"><Label>pH target</Label><Input {...form.register("ph")} placeholder="5.8-6.5" /></div>
            </div>
            <div className="space-y-2"><Label>Notes</Label><Textarea rows={2} {...form.register("notes")} /></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Ingredients</Label>
                <Button type="button" size="sm" variant="ghost" onClick={() => ingArr.append({ name: "", amount: "" })}>+ Add</Button>
              </div>
              {ingArr.fields.map((field, i) => (
                <div key={field.id} className="flex gap-2">
                  <Input placeholder="Name" {...form.register(`ingredients.${i}.name`)} />
                  <Input placeholder='Amount (e.g. "7ml/L")' {...form.register(`ingredients.${i}.amount`)} />
                  <Button type="button" size="icon" variant="ghost" onClick={() => ingArr.remove(i)}>×</Button>
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
