"use client";

import { useState, useTransition } from "react";
import { todayWIB } from "@/lib/date";
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
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { qty: "0", date: today() } });

  function onSubmit(v: Form) {
    startT(async () => {
      const r = await recordHarvestUsage({ harvestId, ...v });
      if (r.ok) {
        toast.success("Usage recorded");
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
        <Button variant="outline">Use product</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Use a product on this harvest</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              For things that get used up: <strong className="text-foreground">pesticides</strong> (ml, L),{" "}
              <strong className="text-foreground">nutrients</strong> (g, kg), seeds, etc.
              FIFO consumption is charged to this harvest&apos;s Usage cost.
            </p>
            <div className="space-y-2">
              <Label>Item</Label>
              <Combobox
                value={form.watch("itemId")}
                onChange={(v) => form.setValue("itemId", v ?? "")}
                placeholder="Pick item"
                options={items.map((i) => ({ value: i.id, label: i.name, description: i.unit }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input type="number" step="any" min="0" {...form.register("qty")} />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" {...form.register("date")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Display qty (optional)</Label>
              <Input {...form.register("displayQty")} placeholder='"200g" / "2 scoops"' />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Record"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
