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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { logSale } from "@/app/(app)/harvest/actions";

const today = () => new Date().toISOString().slice(0, 10);
const schema = z.object({
  produceId: z.string().min(1),
  date: z.string().min(1),
  grade: z.enum(["A", "B", "C", "D"]),
  weight: z.string().regex(/^[0-9.]+$/),
  pricePerKg: z.string().regex(/^[0-9.]+$/),
});
type Form = z.infer<typeof schema>;

export function LogSaleDialog({ harvestId, produces }: { harvestId: string; produces: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { grade: "A", weight: "0", pricePerKg: "0", date: today() } });

  function onSubmit(v: Form) {
    startT(async () => {
      const r = await logSale({ harvestId, ...v });
      if (r.ok) {
        toast.success("Sale logged");
        setOpen(false);
        form.reset({ grade: "A", weight: "0", pricePerKg: "0", date: today() });
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Log sale</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader><DialogTitle>Log sale</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Produce</Label>
                <Combobox
                  value={form.watch("produceId") ?? null}
                  onChange={(v) => form.setValue("produceId", v ?? "")}
                  placeholder="Pick produce"
                  options={produces.map((p) => ({ value: p.id, label: p.name }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Grade</Label>
                <Select value={form.watch("grade")} onValueChange={(v) => form.setValue("grade", v as "A" | "B" | "C" | "D")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["A", "B", "C", "D"].map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" {...form.register("date")} />
              </div>
              <div className="space-y-2">
                <Label>Weight (kg)</Label>
                <Input type="number" step="any" min="0" {...form.register("weight")} />
              </div>
              <div className="space-y-2">
                <Label>Price/kg (IDR)</Label>
                <Input type="number" step="any" min="0" {...form.register("pricePerKg")} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Log"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
