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
import { Combobox } from "@/components/ui/combobox";
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
  itemSubUnit,
  itemSubFactor,
  itemReusable,
  suppliers,
  defaultSupplierId,
}: {
  itemId: string;
  itemUnit: string;
  /** Pack sub-unit ("metres" / "pieces") or null for discrete items. */
  itemSubUnit?: string | null;
  /** How many sub-units fit in one pack (e.g. 50 for a 50 pc polybag).
   *  When set, the qty input asks for sub-units and the dialog converts
   *  to packs before calling receiveStock — so a 1-pack-of-50-pcs polybag
   *  is recorded as the user thinks of it ("50 pieces") instead of the
   *  abstract "1 pack". */
  itemSubFactor?: number | null;
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

  const isPack = !!(itemSubUnit && itemSubFactor && itemSubFactor > 0);
  /** What the qty input is labelled with. For pack items the user types
   *  pieces (e.g. "50") not packs (e.g. "1"); we convert before sending. */
  const qtyUnitLabel = isPack ? itemSubUnit : itemUnit;
  const qtyStr = form.watch("qty");
  const qtyInput = /^[0-9.]+$/.test(qtyStr) ? Number(qtyStr) : 0;
  /** Live "= X pack" preview so the user can sanity-check their entry. */
  const packEquivalentPreview =
    isPack && itemSubFactor && qtyInput > 0
      ? (qtyInput / itemSubFactor).toFixed(3).replace(/\.?0+$/, "")
      : null;
  /** Live cost-per-piece preview, mirroring the install dialog's UX. */
  const pricePerSubUnitPreview =
    isPack && itemSubFactor && parsedPrice > 0
      ? (parsedPrice / itemSubFactor).toFixed(2)
      : null;

  function onSubmit(v: Form) {
    startTransition(async () => {
      const maxUses = v.reusableAcrossHarvests ? Number(v.maxUses) : 1;
      // For pack items the user typed pieces; convert to packs (the
      // canonical unit Batch.qty is stored in) before hitting the action.
      const qtyToSend =
        isPack && itemSubFactor
          ? (Number(v.qty) / itemSubFactor).toString()
          : v.qty;
      // Unit price in DB is per-pack. If the user typed "10000 IDR per pack"
      // and the polybag has 50pcs, that becomes 200 IDR/pc. We keep "price"
      // as the value they entered (assumed per-pack). For pack items we
      // could show a "price per pc" toggle later if it confuses people, but
      // most invoices price per pack.
      const r = await receiveStock({
        itemId,
        date: v.date,
        supplierId: v.supplierId || null,
        qty: qtyToSend,
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" {...form.register("date")} />
              </div>
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Combobox
                  value={form.watch("supplierId") || null}
                  onChange={(v) => form.setValue("supplierId", v ?? undefined)}
                  placeholder="Pick supplier"
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>
                  Quantity ({qtyUnitLabel})
                </Label>
                <Input type="number" step="any" min="0" {...form.register("qty")} />
                {isPack && packEquivalentPreview ? (
                  <p className="text-[11px] text-muted-foreground">
                    = {packEquivalentPreview} {itemUnit}
                    {pricePerSubUnitPreview
                      ? ` · ${pricePerSubUnitPreview} IDR / ${itemSubUnit}`
                      : ""}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Unit price (IDR / {itemUnit})</Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  {...form.register("price")}
                  onChange={(e) => {
                    form.setValue("price", e.target.value);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Total paid (IDR)</Label>
                {/* Match the way Shopee/Tokopedia invoices show line totals.
                    Two-way bound with qty × unit price: type the total and
                    we back-calculate unit price; type unit price + qty and
                    we forward-calculate total. Whichever the user has from
                    the receipt, they can enter directly. */}
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={
                    qtyInput > 0 && parsedPrice > 0
                      ? (qtyInput * parsedPrice).toFixed(0)
                      : ""
                  }
                  onChange={(e) => {
                    const total = Number(e.target.value);
                    if (qtyInput > 0 && total > 0) {
                      form.setValue("price", (total / qtyInput).toFixed(4));
                    }
                  }}
                  placeholder="auto-calc, or type and qty fills unit price"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
