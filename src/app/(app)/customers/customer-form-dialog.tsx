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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createCustomer, updateCustomer } from "@/app/(app)/customers/actions";

export const CUSTOMER_TYPES = [
  { value: "RETAILER", label: "Retailer", hint: "resells to the final consumer" },
  { value: "WHOLESALER", label: "Wholesaler / Distributor", hint: "buys bulk to distribute" },
  { value: "CONSUMER", label: "Consumer", hint: "the final buyer" },
] as const;

const schema = z.object({
  name: z.string().min(1, "Required"),
  type: z.enum(["RETAILER", "WHOLESALER", "CONSUMER"]),
  phone: z.string().optional().default(""),
  email: z.string().email("Invalid email").optional().or(z.literal("")).default(""),
  notes: z.string().optional().default(""),
});
type Form = z.infer<typeof schema>;

export function CustomerFormDialog({
  trigger,
  existing,
}: {
  trigger: ReactNode;
  existing?: {
    id: string;
    name: string;
    type: string;
    phone: string | null;
    email: string | null;
    notes: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isEdit = !!existing;

  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: existing?.name ?? "",
      type: (existing?.type as Form["type"]) ?? "CONSUMER",
      phone: existing?.phone ?? "",
      email: existing?.email ?? "",
      notes: existing?.notes ?? "",
    },
  });

  function onSubmit(values: Form) {
    startTransition(async () => {
      const result = isEdit
        ? await updateCustomer(existing.id, values)
        : await createCustomer(values);
      if (result.ok) {
        toast.success(isEdit ? "Customer updated" : "Customer added");
        setOpen(false);
        form.reset(values);
        router.refresh();
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
            <DialogTitle>{isEdit ? "Edit customer" : "Add customer"}</DialogTitle>
            <DialogDescription>Who you sell to. Type drives reporting.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input {...form.register("name")} autoFocus />
              {form.formState.errors.name?.message ? (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v as Form["type"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CUSTOMER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {CUSTOMER_TYPES.find((t) => t.value === form.watch("type"))?.hint}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input {...form.register("phone")} type="tel" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input {...form.register("email")} type="email" />
                {form.formState.errors.email?.message ? (
                  <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                ) : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea {...form.register("notes")} rows={3} />
            </div>
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
