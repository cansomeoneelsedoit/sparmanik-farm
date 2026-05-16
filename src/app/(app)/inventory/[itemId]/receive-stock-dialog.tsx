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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { receiveStock } from "@/app/(app)/inventory/actions";

const today = () => new Date().toISOString().slice(0, 10);

const schema = z.object({
  date: z.string().min(1),
  supplierId: z.string().optional(),
  qty: z.string().regex(/^[0-9.]+$/, "Number"),
  price: z.string().regex(/^[0-9.]+$/, "Number"),
  exchangeRate: z.string().regex(/^[0-9.]+$/, "Number"),
  reusableAcrossHarvests: z.boolean().default(false),
  maxUses: z.string().regex(/^[1-9][0-9]*$/, "Whole number ≥ 1").default("1"),
});

type Form = z.infer<typeof schema>;

export function ReceiveStockDialog({
  itemId,
  itemUnit,
  itemReusable,
  suppliers,
  defaultSupplierId,
}: {
  itemId: string;
  itemUnit: string;
  itemReusable: boolean;
  suppliers: { id: string; name: string }[];
  defaultSupplierId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: today(),
      supplierId: defaultSupplierId,
      qty: "0",
      price: "0",
      exchangeRate: "10200",
      reusableAcrossHarvests: itemReusable,
      maxUses: "1",
    },
  });

  const reusableChecked = form.watch("reusableAcrossHarvests");
  const showAmortisation = reusableChecked;
  const maxUsesStr = form.watch("maxUses");
  const priceStr = form.watch("price");
  const parsedMaxUses = /^[1-9][0-9]*$/.test(maxUsesStr) ? Number(maxUsesStr) : 1;
  const parsedPrice = /^[0-9.]+$/.test(priceStr) ? Number(priceStr) : 0;
  const amortisedPreview =
    parsedMaxUses > 1 && parsedPrice > 0
      ? (parsedPrice / parsedMaxUses).toFixed(4)
      : null;

  function onSubmit(v: Form) {
    startTransition(async () => {
      const maxUses = v.reusableAcrossHarvests ? Number(v.maxUses) : 1;
      const r = await receiveStock({
        itemId,
        date: v.date,
        supplierId: v.supplierId || null,
        qty: v.qty,
        price: v.price,
        exchangeRate: v.exchangeRate,
        maxUses,
      });
      if (r.ok) {
        toast.success("Stock received");
        setOpen(false);
        form.reset({
          date: today(),
          qty: "0",
          price: "0",
          exchangeRate: v.exchangeRate,
          supplierId: v.supplierId,
          reusableAcrossHarvests: itemReusable,
          maxUses: "1",
        });
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Receive stock</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader><DialogTitle>Receive stock</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" {...form.register("date")} />
              </div>
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select value={form.watch("supplierId") || ""} onValueChange={(v) => form.setValue("supplierId", v || undefined)}>
                  <SelectTrigger><SelectValue placeholder="Pick supplier" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input type="number" step="any" min="0" {...form.register("qty")} />
              </div>
              <div className="space-y-2">
                <Label>Unit price (IDR)</Label>
                <Input type="number" step="any" min="0" {...form.register("price")} />
              </div>
              <div className="space-y-2">
                <Label>FX rate (IDR/AUD)</Label>
                <Input type="number" step="any" min="0" {...form.register("exchangeRate")} />
              </div>
            </div>

            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={reusableChecked}
                  onChange={(e) => form.setValue("reusableAcrossHarvests", e.target.checked)}
                />
                <span>Reusable across harvests (depreciable — e.g. cocopeat, rockwool)</span>
              </label>
              {showAmortisation ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Expected harvest uses</Label>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      {...form.register("maxUses")}
                    />
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>{`Amortised cost per use: ${amortisedPreview ?? "—"} IDR per ${itemUnit} per harvest`}</div>
                    <div>Each harvest is charged this × qty installed. Full price hits Business P&amp;L on purchase.</div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
