"use client";

import { useState, useTransition, type ReactNode } from "react";
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
import { logSale, updateSale, createCustomerQuick } from "@/app/(app)/harvest/actions";

type Customer = { id: string; name: string; type: string };
type PackagingItem = { id: string; name: string; unit: string; cost: string };
type Grade = "A" | "B" | "C" | "D";

/** An existing sale being edited (pre-fills the dialog). */
export type EditableSale = {
  id: string;
  produceId: string;
  date: string; // YYYY-MM-DD
  grade: Grade;
  weight: string;
  pricePerKg: string;
  amount: string; // the recorded charged total
  customerId: string | null;
};

const CUSTOMER_TYPES = [
  { value: "RETAILER", label: "Retailer", hint: "resells to the final consumer" },
  { value: "WHOLESALER", label: "Wholesaler / Distributor", hint: "buys bulk to distribute" },
  { value: "CONSUMER", label: "Consumer", hint: "the final buyer" },
] as const;

const typeLabel = (t: string) =>
  CUSTOMER_TYPES.find((x) => x.value === t)?.label ?? t;

const today = () => new Date().toISOString().slice(0, 10);
const schema = z.object({
  produceId: z.string().min(1),
  date: z.string().min(1),
  grade: z.enum(["A", "B", "C", "D"]),
  weight: z.string().regex(/^[0-9.]+$/),
  pricePerKg: z.string().regex(/^[0-9.]+$/),
});
type Form = z.infer<typeof schema>;

export function LogSaleDialog({
  harvestId,
  produces,
  customers: initialCustomers = [],
  packagingItems = [],
  existing,
  trigger,
}: {
  harvestId: string;
  produces: { id: string; name: string }[];
  customers?: Customer[];
  /** In-stock items usable as packaging (boxes, bags, containers…) + cost. */
  packagingItems?: PackagingItem[];
  /** When set, the dialog edits this sale instead of creating a new one. */
  existing?: EditableSale;
  /** Custom trigger (e.g. an edit pencil). Defaults to a "Log sale" button. */
  trigger?: ReactNode;
}) {
  const isEdit = !!existing;
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [customerId, setCustomerId] = useState<string | null>(existing?.customerId ?? null);
  // Type to use when creating a NEW customer ad-hoc.
  const [newType, setNewType] = useState<string>("CONSUMER");
  // Packaging (create-only): which item, how many, and how it's priced.
  const [pkgItemId, setPkgItemId] = useState<string | null>(null);
  const [pkgQty, setPkgQty] = useState("1");
  const [pkgMode, setPkgMode] = useState<"included" | "ontop">("included");
  const [pkgCharge, setPkgCharge] = useState(""); // per-unit charge for "ontop"

  const defaults: Form = existing
    ? { produceId: existing.produceId, date: existing.date, grade: existing.grade, weight: existing.weight, pricePerKg: existing.pricePerKg }
    : { produceId: "", grade: "A", weight: "0", pricePerKg: "0", date: today() };
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: defaults });

  // Custom-total override (discount / markup). Pre-enabled on edit when the
  // stored amount doesn't equal weight × price/kg (i.e. it was overridden,
  // or carried an on-top packaging charge).
  const overrideWasUsed = (() => {
    if (!existing) return false;
    const base = Number(existing.weight) * Number(existing.pricePerKg);
    return Math.abs(Number(existing.amount) - base) > 0.005;
  })();
  const [overrideOn, setOverrideOn] = useState(overrideWasUsed);
  const [overrideAmount, setOverrideAmount] = useState(existing ? existing.amount : "");

  const pkgItem = packagingItems.find((p) => p.id === pkgItemId) ?? null;
  function pickPackaging(id: string | null) {
    setPkgItemId(id);
    const it = packagingItems.find((p) => p.id === id);
    if (it && !pkgCharge) setPkgCharge(it.cost);
  }
  const weightNum = Number(form.watch("weight")) || 0;
  const priceNum = Number(form.watch("pricePerKg")) || 0;
  const pkgQtyNum = Number(pkgQty) || 0;
  const onTopExtra = !isEdit && pkgItem && pkgMode === "ontop" ? (Number(pkgCharge) || 0) * pkgQtyNum : 0;
  const autoTotal = weightNum * priceNum + onTopExtra;
  const finalAmount = overrideOn ? Number(overrideAmount) || 0 : autoTotal;

  function toggleOverride(on: boolean) {
    setOverrideOn(on);
    // Seed the field with the current computed total so the user edits from
    // the "list" price down to the discounted figure.
    if (on && overrideAmount.trim() === "") setOverrideAmount(String(Math.round(autoTotal)));
  }

  async function handleCreateCustomer(typed: string) {
    const r = await createCustomerQuick({ name: typed, type: newType });
    if (r.ok && r.data) {
      const c = { id: r.data.id, name: r.data.name, type: r.data.type };
      setCustomers((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerId(c.id);
      toast.success(`Added ${typeLabel(c.type).toLowerCase()}: ${c.name}`);
    } else if (!r.ok) {
      toast.error(r.error);
    }
  }

  function reset() {
    form.reset(defaults);
    setCustomerId(existing?.customerId ?? null);
    setNewType("CONSUMER");
    setPkgItemId(null);
    setPkgQty("1");
    setPkgMode("included");
    setPkgCharge("");
    setOverrideOn(overrideWasUsed);
    setOverrideAmount(existing ? existing.amount : "");
  }

  function onSubmit(v: Form) {
    const amountOverride = overrideOn ? overrideAmount : undefined;
    startT(async () => {
      const r = isEdit
        ? await updateSale(existing.id, {
            produceId: v.produceId,
            date: v.date,
            grade: v.grade,
            weight: v.weight,
            pricePerKg: v.pricePerKg,
            customerId: customerId || undefined,
            amountOverride,
          })
        : await logSale({
            harvestId,
            ...v,
            customerId: customerId || undefined,
            packagingItemId: pkgItemId || undefined,
            packagingQty: pkgItemId ? pkgQty : undefined,
            packagingMode: pkgItemId ? pkgMode : undefined,
            packagingChargePerUnit: pkgItemId && pkgMode === "ontop" ? pkgCharge : undefined,
            amountOverride,
          });
      if (r.ok) {
        toast.success(isEdit ? "Sale updated" : "Sale logged");
        setOpen(false);
        reset();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger ?? <Button>Log sale</Button>}</DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="min-w-0">
          <DialogHeader><DialogTitle>{isEdit ? "Edit sale" : "Log sale"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
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
                <Select value={form.watch("grade")} onValueChange={(v) => form.setValue("grade", v as Grade)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["A", "B", "C", "D"].map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Customer — search existing or create ad-hoc. The type select
                applies when creating a new one (Retailer / Wholesaler / Consumer). */}
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)] gap-3 [&>*]:min-w-0">
              <div className="space-y-2">
                <Label>
                  Customer{" "}
                  <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Combobox
                  value={customerId}
                  onChange={(v) => setCustomerId(v)}
                  placeholder="Search or type to add"
                  options={customers.map((c) => ({
                    value: c.id,
                    label: c.name,
                    description: typeLabel(c.type),
                  }))}
                  onCreate={handleCreateCustomer}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">New customer is a…</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CUSTOMER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 [&>*]:min-w-0">
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

            {/* Packaging (optional, create-only) — consume a box/bag onto the
                cycle's usage. Not editable after the fact. */}
            {!isEdit && packagingItems.length > 0 ? (
              <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                <div className="space-y-2">
                  <Label className="text-sm">Packaging (optional)</Label>
                  <Combobox
                    value={pkgItemId}
                    onChange={(v) => pickPackaging(v)}
                    placeholder="No packaging — or pick a box / bag / container"
                    options={packagingItems.map((p) => ({
                      value: p.id,
                      label: p.name,
                      description: `≈ Rp ${Number(p.cost).toLocaleString("id-ID")} / ${p.unit}`,
                    }))}
                  />
                </div>
                {pkgItem ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                    <div className="space-y-1">
                      <Label className="text-xs">How many ({pkgItem.unit})?</Label>
                      <Input type="number" step="any" min="0" value={pkgQty} onChange={(e) => setPkgQty(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Packaging cost is…</Label>
                      <Select value={pkgMode} onValueChange={(v) => setPkgMode(v as "included" | "ontop")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="included">Included in the kg price</SelectItem>
                          <SelectItem value="ontop">Charged on top</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {pkgMode === "ontop" ? (
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">Charge per {pkgItem.unit} (Rp) — defaults to cost</Label>
                        <Input type="number" step="any" min="0" value={pkgCharge} onChange={(e) => setPkgCharge(e.target.value)} />
                      </div>
                    ) : null}
                    <p className="text-[11px] break-words text-muted-foreground sm:col-span-2">
                      {`${pkgQtyNum || 0} × ${pkgItem.name} comes off stock onto this cycle’s usage at cost.`}
                      {pkgMode === "ontop"
                        ? " The charge above is added to the sale total."
                        : " (Cost only — not added to the sale total.)"}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Total + optional custom-total override (discount / markup). The
                weight + price/kg above are always recorded as the "list"
                figures so yield and reporting stay accurate. */}
            <div className="space-y-2 rounded-md bg-muted/30 px-3 py-2 text-sm">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-foreground"
                  checked={overrideOn}
                  onChange={(e) => toggleOverride(e.target.checked)}
                />
                Custom total (discount / markup) — keeps the kg + price/kg as recorded
              </label>
              {overrideOn ? (
                <div className="flex items-center gap-2">
                  <Label className="whitespace-nowrap text-xs">Total charged (Rp)</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={overrideAmount}
                    onChange={(e) => setOverrideAmount(e.target.value)}
                    className="h-8"
                  />
                </div>
              ) : null}
              <div>
                Sale total:{" "}
                <strong className="text-foreground">
                  Rp {finalAmount.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                </strong>
                {overrideOn && Math.abs(finalAmount - autoTotal) > 0.005 ? (
                  <span className="text-xs text-muted-foreground">
                    {" "}(list Rp {autoTotal.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                    {finalAmount < autoTotal
                      ? ` · discount Rp ${(autoTotal - finalAmount).toLocaleString("id-ID", { maximumFractionDigits: 2 })}`
                      : ` · +Rp ${(finalAmount - autoTotal).toLocaleString("id-ID", { maximumFractionDigits: 2 })}`}
                    )
                  </span>
                ) : onTopExtra > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {" "}(incl. Rp {onTopExtra.toLocaleString("id-ID")} packaging)
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save" : "Log"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
