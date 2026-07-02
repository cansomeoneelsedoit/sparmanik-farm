"use client";

import { useState, useTransition } from "react";
import { todayWIB } from "@/lib/date";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { Combobox } from "@/components/ui/combobox";
import { recordHarvestUsage } from "@/app/(app)/harvest/actions";

const today = () => todayWIB();
const schema = z.object({
  itemId: z.string().min(1),
  qty: z.string().regex(/^[0-9.]+$/),
  displayQty: z.string().optional(),
  date: z.string().min(1),
});
type Form = z.infer<typeof schema>;

export function RecordUsageDialog({ harvestId, items }: { harvestId: string; items: { id: string; name: string; unit: string }[] }) {
  const t = useTranslations("usageDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { qty: "0", date: today() } });

  function onSubmit(v: Form) {
    startT(async () => {
      const r = await recordHarvestUsage({ harvestId, ...v });
      if (r.ok) {
        toast.success(t("toastRecorded"));
        setOpen(false);
        form.reset({ qty: "0", date: today() });
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {t("blurb")}
            </p>
            <div className="space-y-2">
              <Label>{t("item")}</Label>
              <Combobox
                value={form.watch("itemId")}
                onChange={(v) => form.setValue("itemId", v ?? "")}
                placeholder={t("pickItem")}
                options={items.map((i) => ({ value: i.id, label: i.name, description: i.unit }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("quantity")}</Label>
                <Input type="number" step="any" min="0" {...form.register("qty")} />
              </div>
              <div className="space-y-2">
                <Label>{t("date")}</Label>
                <Input type="date" {...form.register("date")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("shownAs")}</Label>
              <Input {...form.register("displayQty")} placeholder={t("shownAsPlaceholder")} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>{tCommon("cancel")}</Button>
            <Button type="submit" disabled={pending}>{pending ? t("saving") : t("record")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
