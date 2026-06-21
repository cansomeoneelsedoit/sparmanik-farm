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
import { logSale, createCustomerQuick } from "@/app/(app)/harvest/actions";

type Customer = { id: string; name: string; type: string };
type PackagingItem = { id: string; name: string; unit: string; cost: string };

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
}: {
  harvestId: string;
  produces: { id: string; name: string }[];
  customers?: Customer[];
  /** In-stock items usable as packaging (boxes, bags, containers…) + cost. */
  packagingItems?: PackagingItem[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [customerId, setCustomerId] = useState<string | null>(null);
  // Type to use when creating a NEW customer ad-hoc.
  const [newType, setNewType] = useState<string>("CONSUMER");
  // Packaging: which item, how many, and how it's priced.
  const [pkgItemId, setPkgItemId] = useState<string | null>(null);
  const [pkgQty, setPkgQty] = useState("1");
  const [pkgMode, setPkgMode] = useState<"included" | "ontop">("included");
  const [pkgCharge, setPkgCharge] = useState(""); // per-unit charge for "ontop"
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { grade: "A", weight: "0", pricePerKg: "0", date: today() } });

  const pkgItem = packagingItems.find((p) => p.id === pkgItemId) ?? null;
  // When you pick a packaging item, default the on-top charge to its cost.
  function pickPackaging(id: string | null) {
    setPkgItemId(id);
    const it = packagingItems.find((p) => p.id === id);
    if (it && !pkgCharge) setPkgCharge(it.cost);
  }
  const weightNum = Number(form.watch("weight")) || 0;
  const priceNum = Number(form.watch("pricePerKg")) || 0;
  const pkgQtyNum = Number(pkgQty) || 0;
  const onTopExtra = pkgItem && pkgMode === "ontop" ? (Number(pkgCharge) || 0) * pkgQtyNum : 0;
  const saleTotal = weightNum * priceNum + onTopExtra;

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
    form.reset({ grade: "A", weight: "0", pricePerKg: "0", date: today() });
    setCustomerId(null);
    setNewType("CONSUMER");
    setPkgItemId(null);
    setPkgQty("1");
    setPkgMode("included");
    setPkgCharge("");
  }

  function onSubmit(v: Form) {
    startT(async () => {
      const r = await logSale({
        harvestId,
        ...v,
        customerId: customerId || undefined,
        packagingItemId: pkgItemId || undefined,
        packagingQty: pkgItemId ? pkgQty : undefined,
        packagingMode: pkgItemId ? pkgMode : undefined,
        packagingChargePerUnit: pkgItemId && pkgMode === "ontop" ? pkgCharge : undefined,
      });
      if (r.ok) {
        toast.success("Sale logged");
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
      <DialogTrigger asChild>
        <Button>Log sale</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="min-w-0">
          <DialogHeader><DialogTitle>Log sale</DialogTitle></DialogHeader>
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
                <Select value={form.watch("grade")} onValueChange={(v) => form.setValue("grade", v as "A" | "B" | "C" | "D")}>
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

            {/* Packaging (optional) — consume a box/bag onto the cycle's usage. */}
            {packagingItems.length > 0 ? (
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

            <div className="rounded-md bg-muted/30 px-3 py-2 text-sm">
              Sale total:{" "}
              <strong className="text-foreground">
                Rp {saleTotal.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
              </strong>
              {onTopExtra > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {" "}(incl. Rp {onTopExtra.toLocaleString("id-ID")} packaging)
                </span>
              ) : null}
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
