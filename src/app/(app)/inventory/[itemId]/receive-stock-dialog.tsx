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
});

type Form = z.infer<typeof schema>;

export function ReceiveStockDialog({
  itemId,
  suppliers,
  defaultSupplierId,
}: {
  itemId: string;
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
    },
  });

  function onSubmit(v: Form) {
    startTransition(async () => {
      const r = await receiveStock({ itemId, ...v, supplierId: v.supplierId || null });
      if (r.ok) {
        toast.success("Stock received");
        setOpen(false);
        form.reset({ date: today(), qty: "0", price: "0", exchangeRate: v.exchangeRate, supplierId: v.supplierId });
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
