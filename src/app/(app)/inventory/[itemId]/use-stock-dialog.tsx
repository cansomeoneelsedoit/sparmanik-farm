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
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { qty: "0" } });

  function onSubmit(v: Form) {
    startTransition(async () => {
      const r = await consumeItem({ itemId, qty: v.qty });
      if (r.ok) {
        toast.success("Stock used (FIFO)");
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
        <Button>Use stock</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader><DialogTitle>Use stock</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Quantity to use</Label>
              <div className="flex items-center gap-2">
                <Input type="number" step="any" min="0" {...form.register("qty")} />
                <span className="text-sm text-muted-foreground whitespace-nowrap">{unit}</span>
              </div>
              <p className="text-xs text-muted-foreground">On hand: {maxQty} {unit}. FIFO consumes oldest batch first.</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Using…" : "Use"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
