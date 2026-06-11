"use client";

import { useState, useTransition } from "react";
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
import { consumeItem } from "@/app/(app)/inventory/actions";

const schema = z.object({ qty: z.string().regex(/^[0-9.]+$/, "Number") });
type Form = z.infer<typeof schema>;

export function UseStockDialog({
  itemId,
  maxQty,
  unit,
}: {
  itemId: string;
  maxQty: string;
  unit: string;
}) {
  const t = useTranslations("useStock");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { qty: "0" } });

  function onSubmit(v: Form) {
    startTransition(async () => {
      const r = await consumeItem({ itemId, qty: v.qty });
      if (r.ok) {
        toast.success(t("successToast"));
        setOpen(false);
        form.reset({ qty: "0" });
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader><DialogTitle>{t("title")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>
                {t("qtyLabel")}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  {t("maxHint", { max: maxQty, unit })}
                </span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  max={maxQty}
                  autoFocus
                  placeholder={t("placeholder", { max: maxQty })}
                  {...form.register("qty")}
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {unit}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("fifoHint", { max: maxQty, unit })}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>{tc("cancel")}</Button>
            <Button type="submit" disabled={pending}>{pending ? t("using") : t("use")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
