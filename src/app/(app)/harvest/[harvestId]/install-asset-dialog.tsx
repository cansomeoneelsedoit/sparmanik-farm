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
import { installHarvestAsset } from "@/app/(app)/harvest/actions";

const today = () => new Date().toISOString().slice(0, 10);
const schema = z.object({
  itemId: z.string().min(1),
  qty: z.string().regex(/^[0-9.]+$/, "Number"),
  date: z.string().min(1),
  type: z.enum(["reusable", "onetime"]).default("reusable"),
  condition: z.enum(["new", "secondhand"]).default("new"),
});
type Form = z.infer<typeof schema>;

export type InstallAssetItem = {
  id: string;
  name: string;
  unit: string;
  available: number;
  // The most-stock-rich batch's depreciation snapshot, surfaced here so the
  // dialog can display the per-use charge preview before submitting.
  topBatch?: {
    maxUses: number;
    useCount: number;
    amortisedCostPerUse: string | null;
  } | null;
};

export function InstallAssetDialog({
  harvestId,
  items,
}: {
  harvestId: string;
  items: InstallAssetItem[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { qty: "1", date: today(), type: "reusable", condition: "new" },
  });

  const itemId = form.watch("itemId");
  const qtyStr = form.watch("qty");
  const selected = items.find((i) => i.id === itemId);
  const qty = /^[0-9.]+$/.test(qtyStr) ? Number(qtyStr) : 0;
  const depreciable =
    selected?.topBatch &&
    selected.topBatch.maxUses > 1 &&
    !!selected.topBatch.amortisedCostPerUse;
  const charge =
    depreciable && selected?.topBatch?.amortisedCostPerUse
      ? (qty * Number(selected.topBatch.amortisedCostPerUse)).toFixed(4)
      : null;
  const nextUseLabel =
    depreciable && selected?.topBatch
      ? `use ${selected.topBatch.useCount + 1} of ${selected.topBatch.maxUses}`
      : null;

  function onSubmit(v: Form) {
    startT(async () => {
      const r = await installHarvestAsset({
        harvestId,
        itemId: v.itemId,
        qty: v.qty,
        date: v.date,
        reusable: v.type === "reusable",
        condition: v.condition === "new" ? "new" : "second-hand",
      });
      if (r.ok) {
        toast.success("Asset installed");
        setOpen(false);
        form.reset({ qty: "1", date: today(), type: "reusable", condition: "new" });
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Install from inventory</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader><DialogTitle>Install asset on harvest</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Item</Label>
              <Select value={form.watch("itemId") ?? ""} onValueChange={(v) => form.setValue("itemId", v)}>
                <SelectTrigger><SelectValue placeholder="Pick item with stock" /></SelectTrigger>
                <SelectContent>
                  {items.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name} — {i.available} {i.unit} avail
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Quantity{selected ? ` (${selected.unit})` : ""}</Label>
                <Input type="number" step="any" min="0" {...form.register("qty")} />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" {...form.register("date")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v as "reusable" | "onetime")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reusable">Reusable</SelectItem>
                    <SelectItem value="onetime">One-time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Condition</Label>
                <Select value={form.watch("condition")} onValueChange={(v) => form.setValue("condition", v as "new" | "secondhand")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="secondhand">Second-hand</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {depreciable ? (
              <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                <div>
                  Depreciable item — harvest will be charged{" "}
                  <strong className="text-foreground">{charge ?? "—"}</strong>{" "}
                  ({nextUseLabel}).
                </div>
                <div>Full purchase cost is already on Business P&amp;L.</div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending || !itemId}>{pending ? "Installing…" : "Install"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
