"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateGeneralSettings } from "@/app/(app)/settings/actions";

const schema = z.object({
  farmName: z.string().min(1),
  exchangeRate: z.string().regex(/^[0-9.]+$/),
});
type Form = z.infer<typeof schema>;

export function GeneralSettingsForm({ initial }: { initial: Form }) {
  const [pending, startT] = useTransition();
  const router = useRouter();
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: initial });

  function onSubmit(v: Form) {
    startT(async () => {
      const r = await updateGeneralSettings(v);
      if (r.ok) {
        toast.success("Settings saved");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label>Farm name</Label>
        <Input {...form.register("farmName")} />
      </div>
      <div className="space-y-2">
        <Label>Exchange rate (IDR per AUD)</Label>
        <Input type="number" step="any" min="0" {...form.register("exchangeRate")} />
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
    </form>
  );
}
