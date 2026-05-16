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
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { createItem, updateItem } from "@/app/(app)/inventory/actions";

const schema = z.object({
  name: z.string().min(1, "Required"),
  unit: z.string().min(1, "Required"),
  categoryId: z.string().optional(),
  defaultSupplierId: z.string().optional(),
  reorder: z.string().regex(/^[0-9.]+$/, "Number").default("0"),
  location: z.string().optional(),
  reusable: z.boolean().default(false),
  shopeeUrl: z.string().url().optional().or(z.literal("")).optional(),
});

type Form = z.infer<typeof schema>;

export function NewItemDialog({
  trigger,
  categories,
  suppliers,
  existing,
}: {
  trigger: ReactNode;
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  existing?: {
    id: string;
    name: string;
    unit: string;
    categoryId: string | null;
    defaultSupplierId: string | null;
    reorder: string;
    location: string | null;
    reusable: boolean;
    shopeeUrl: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isEdit = !!existing;
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: existing
      ? {
          name: existing.name,
          unit: existing.unit,
          categoryId: existing.categoryId ?? undefined,
          defaultSupplierId: existing.defaultSupplierId ?? undefined,
          reorder: existing.reorder,
          location: existing.location ?? "",
          reusable: existing.reusable,
          shopeeUrl: existing.shopeeUrl ?? "",
        }
      : { name: "", unit: "", reorder: "0", reusable: false },
  });

  function onSubmit(values: Form) {
    startTransition(async () => {
      const payload = {
        ...values,
        categoryId: values.categoryId || null,
        defaultSupplierId: values.defaultSupplierId || null,
        shopeeUrl: values.shopeeUrl || null,
      };
      const r = isEdit ? await updateItem(existing.id, payload) : await createItem(payload);
      if (r.ok) {
        toast.success(isEdit ? "Item saved" : "Item added");
        setOpen(false);
        if (!isEdit) form.reset();
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
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit item" : "New item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Row label="Name" error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} autoFocus />
            </Row>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Unit" error={form.formState.errors.unit?.message}>
                <Input {...form.register("unit")} placeholder="rolls / litres / pcs" />
              </Row>
              <Row label="Reorder threshold" error={form.formState.errors.reorder?.message}>
                <Input {...form.register("reorder")} type="number" min="0" step="any" />
              </Row>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Category">
                <Combobox
                  value={form.watch("categoryId") || null}
                  onChange={(v) => form.setValue("categoryId", v ?? undefined)}
                  placeholder="Pick category"
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                />
              </Row>
              <Row label="Default supplier">
                <Combobox
                  value={form.watch("defaultSupplierId") || null}
                  onChange={(v) => form.setValue("defaultSupplierId", v ?? undefined)}
                  placeholder="Pick supplier"
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                />
              </Row>
            </div>
            <Row label="Location">
              <Input {...form.register("location")} placeholder="Warehouse A" />
            </Row>
            <Row label="Shop URL">
              <Input {...form.register("shopeeUrl")} placeholder="https://shopee.tld/..." />
            </Row>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Reusable (asset)</Label>
              <Switch checked={form.watch("reusable")} onCheckedChange={(v) => form.setValue("reusable", v)} />
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

function Row({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
