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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { installHarvestAsset } from "@/app/(app)/harvest/actions";

const today = () => todayWIB();
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
  /** Amount available, expressed in pack units (rolls, bags, boxes). */
  available: number;
  // For "sold as a pack" items: subFactor sub-units fit in one pack, and
  // installs are entered in sub-units rather than packs. Cost charged to the
  // greenhouse = unitPrice × (subUnitsInstalled / subFactor).
  subUnit?: string | null;
  subFactor?: number | null;
  /** FIFO-top batch's unit price, used by the dialog for the live cost preview
   *  when the item is sold as a pack. */
  topBatchUnitPrice?: string | null;
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
  /** Raw value of the qty input (always Number). For pack-style items the
   *  user is typing sub-units (metres). For everything else they're typing
   *  packs (rolls / kg / pcs). */
  const qtyInput = /^[0-9.]+$/.test(qtyStr) ? Number(qtyStr) : 0;
  const isPack = !!(selected?.subUnit && selected?.subFactor && selected.subFactor > 0);
  /** Always-in-packs version of the input — what we'll send to the server. */
  const qtyInPacks = isPack && selected?.subFactor ? qtyInput / selected.subFactor : qtyInput;

  const depreciable =
    selected?.topBatch &&
    selected.topBatch.maxUses > 1 &&
    !!selected.topBatch.amortisedCostPerUse;
  const charge =
    depreciable && selected?.topBatch?.amortisedCostPerUse
      ? (qtyInPacks * Number(selected.topBatch.amortisedCostPerUse)).toFixed(4)
      : null;
  const nextUseLabel =
    depreciable && selected?.topBatch
      ? `use ${selected.topBatch.useCount + 1} of ${selected.topBatch.maxUses}`
      : null;

  /** Live proportional-cost preview for pack-style items. Uses the FIFO-top
   *  batch's unit price as an estimate; actual charge may span multiple
   *  batches at different prices if the install exceeds the top batch's
   *  remaining stock — the server does the exact math via consumeFifo. */
  const packCostPreview =
    isPack && selected?.topBatchUnitPrice && selected.subFactor && qtyInput > 0
      ? (qtyInput * (Number(selected.topBatchUnitPrice) / selected.subFactor)).toFixed(2)
      : null;
  const packPerSubUnit =
    isPack && selected?.topBatchUnitPrice && selected.subFactor
      ? (Number(selected.topBatchUnitPrice) / selected.subFactor).toFixed(4)
      : null;
  /** Available rendered in sub-units when the item is sold as a pack. */
  const availableLabel =
    isPack && selected?.subFactor
      ? `${(selected.available * selected.subFactor).toFixed(0)} ${selected.subUnit} avail`
      : selected
        ? `${selected.available} ${selected.unit} avail`
        : "";

  function onSubmit(v: Form) {
    startT(async () => {
      // For pack-style items, the user typed sub-units (metres) but the
      // server consumes inventory in pack units (rolls). Convert here.
      const sel = items.find((i) => i.id === v.itemId);
      const isPackItem = !!(sel?.subUnit && sel?.subFactor && sel.subFactor > 0);
      const qtyToSend =
        isPackItem && sel?.subFactor
          ? (Number(v.qty) / sel.subFactor).toString()
          : v.qty;
      const r = await installHarvestAsset({
        harvestId,
        itemId: v.itemId,
        qty: qtyToSend,
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
        <Button variant="outline">Install asset</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Install an asset on this harvest</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              For physical things installed in the greenhouse:{" "}
              <strong className="text-foreground">drippers, plumbing, frames</strong> (Fixed),
              or <strong className="text-foreground">rockwool, grow bags</strong> (Reusable — depreciates per use).
            </p>
            <div className="space-y-2">
              <Label>Item</Label>
              <Combobox
                value={form.watch("itemId")}
                onChange={(v) => form.setValue("itemId", v ?? "")}
                placeholder="Pick item with stock"
                options={items.map((i) => ({
                  value: i.id,
                  label: i.name,
                  description:
                    i.subUnit && i.subFactor && i.subFactor > 0
                      ? `${(i.available * i.subFactor).toFixed(0)} ${i.subUnit} avail`
                      : `${i.available} ${i.unit} avail`,
                }))}
              />
              {selected ? (
                <p className="text-xs text-muted-foreground">{availableLabel}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  Quantity
                  {selected
                    ? ` (${isPack ? selected.subUnit : selected.unit})`
                    : ""}
                </Label>
                <Input type="number" step="any" min="0" {...form.register("qty")} />
                {isPack && packCostPreview ? (
                  <p className="text-xs text-muted-foreground">
                    {qtyInput} {selected?.subUnit} × {packPerSubUnit}
                    /{selected?.subUnit} ={" "}
                    <strong className="text-foreground">{packCostPreview}</strong>
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" {...form.register("date")} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v as "reusable" | "onetime")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reusable">Reusable (depreciates per use)</SelectItem>
                    <SelectItem value="onetime">Fixed (stays here, one-time)</SelectItem>
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
