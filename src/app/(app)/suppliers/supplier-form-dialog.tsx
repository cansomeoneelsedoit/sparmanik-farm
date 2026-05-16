"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSupplier, updateSupplier } from "@/app/(app)/suppliers/actions";

const schema = z.object({
  name: z.string().min(1, "Required"),
  phone: z.string().optional().default(""),
  email: z.string().email("Invalid email").optional().or(z.literal("")).default(""),
  notes: z.string().optional().default(""),
  shopUrl: z.string().url("Invalid URL").optional().or(z.literal("")).default(""),
});

type Form = z.infer<typeof schema>;

export function SupplierFormDialog({
  trigger,
  existing,
}: {
  trigger: ReactNode;
  existing?: { id: string; name: string; phone: string | null; email: string | null; notes: string | null; shopUrl: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isEdit = !!existing;

  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: existing?.name ?? "",
      phone: existing?.phone ?? "",
      email: existing?.email ?? "",
      notes: existing?.notes ?? "",
      shopUrl: existing?.shopUrl ?? "",
    },
  });

  function onSubmit(values: Form) {
    startTransition(async () => {
      const result = isEdit
        ? await updateSupplier(existing.id, values)
        : await createSupplier(values);
      if (result.ok) {
        toast.success(isEdit ? "Supplier updated" : "Supplier added");
        setOpen(false);
        form.reset(values);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit supplier" : "Add supplier"}</DialogTitle>
            <DialogDescription>Contact info and shop URL.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Field label="Name" error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} autoFocus />
            </Field>
            <Field label="Phone" error={form.formState.errors.phone?.message}>
              <Input {...form.register("phone")} type="tel" />
            </Field>
            <Field label="Email" error={form.formState.errors.email?.message}>
              <Input {...form.register("email")} type="email" />
            </Field>
            <Field label="Shop URL" error={form.formState.errors.shopUrl?.message}>
              <Input {...form.register("shopUrl")} type="url" placeholder="https://" />
            </Field>
            <Field label="Notes" error={form.formState.errors.notes?.message}>
              <Textarea {...form.register("notes")} rows={3} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
