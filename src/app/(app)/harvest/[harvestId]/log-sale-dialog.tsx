"use client";

import { useState, useTransition, type ReactNode } from "react";
import { todayWIB } from "@/lib/date";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

const today = () => todayWIB();
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
  unsoldByProduce = {},
  existing,
  trigger,
}: {
  harvestId: string;
  produces: { id: string; name: string }[];
  customers?: Customer[];
  /** In-stock items usable as packaging (boxes, bags, containers…) + cost. */
  packagingItems?: PackagingItem[];
  /** Unsold-on-hand kg per produce that has a recorded harvested total. When
   *  the picked produce is here, the dialog asks whether this sale comes from
   *  that pool (pool shrinks) or is freshly picked (total produced grows). */
  unsoldByProduce?: Record<string, number>;
  /** When set, the dialog edits this sale instead of creating a new one. */
  existing?: EditableSale;
  /** Custom trigger (e.g. an edit pencil). Defaults to a "Log sale" button. */
  trigger?: ReactNode;
}) {
  const isEdit = !!existing;
  const t = useTranslations("saleDialog");
  const tCommon = useTranslations("common");
  const CUSTOMER_TYPES = [
    { value: "RETAILER", label: t("typeRetailer") },
    { value: "WHOLESALER", label: t("typeWholesaler") },
    { value: "CONSUMER", label: t("typeConsumer") },
  ];
  const typeLabel = (ty: string) => CUSTOMER_TYPES.find((x) => x.value === ty)?.label ?? ty;
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
  // Charity donation (create-only): recorded as income at a default 50k/kg,
  // and highlighted in the charity reporting. Editing a charity sale keeps its
  // flag (updateSale doesn't touch it), so the checkbox is create-only.
  const CHARITY_DEFAULT_PRICE = "50000";
  const [charity, setCharity] = useState(false);
  const [charityRecipient, setCharityRecipient] = useState("");
  // Where the melon comes from when the produce tracks an unsold pool:
  // true = from the pool (pool shrinks), false = freshly picked (total
  // produced grows so the pool stays put). Create-only. null = the user
  // hasn't chosen — default to the pool while it has stock, else fresh.
  const [fromUnsoldChoice, setFromUnsoldChoice] = useState<boolean | null>(null);
  function toggleCharity(on: boolean) {
    setCharity(on);
    // Seed the price with the standard 50k/kg when none has been set yet
    // (still editable afterwards).
    if (on && (Number(form.getValues("pricePerKg")) || 0) <= 0) {
      form.setValue("pricePerKg", CHARITY_DEFAULT_PRICE);
    }
  }

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
  // Effective source: the user's explicit pick, else pool-while-it-has-stock
  // (a sold-out crop's new pick sensibly defaults to "freshly picked").
  const watchedProduceId = form.watch("produceId");
  const watchedPool = unsoldByProduce[watchedProduceId];
  const fromUnsold = fromUnsoldChoice ?? (watchedPool ?? 0) > 0;
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
      toast.success(t("addedCustomer", { name: c.name }));
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
    setCharity(false);
    setCharityRecipient("");
    setFromUnsoldChoice(null);
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
            charity,
            charityRecipient: charity ? charityRecipient : undefined,
            // Only ask the server to adjust the pool when this produce has one.
            fromUnsold: unsoldByProduce[v.produceId] !== undefined ? fromUnsold : undefined,
          });
      if (r.ok) {
        toast.success(isEdit ? t("toastUpdated") : t("toastLogged"));
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
      <DialogTrigger asChild>{trigger ?? <Button>{t("trigger")}</Button>}</DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="min-w-0">
          <DialogHeader><DialogTitle>{isEdit ? t("titleEdit") : t("titleNew")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <div className="space-y-2">
                <Label>{t("produce")}</Label>
                <Combobox
                  value={form.watch("produceId") ?? null}
                  onChange={(v) => form.setValue("produceId", v ?? "")}
                  placeholder={t("pickProduce")}
                  options={produces.map((p) => ({ value: p.id, label: p.name }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("grade")}</Label>
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
                  {t("customer")}{" "}
                  <span className="text-xs font-normal text-muted-foreground">{t("optional")}</span>
                </Label>
                <Combobox
                  value={customerId}
                  onChange={(v) => setCustomerId(v)}
                  placeholder={t("searchOrAdd")}
                  options={customers.map((c) => ({
                    value: c.id,
                    label: c.name,
                    description: typeLabel(c.type),
                  }))}
                  onCreate={handleCreateCustomer}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t("newCustomerType")}</Label>
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
                <Label>{t("date")}</Label>
                <Input type="date" {...form.register("date")} />
              </div>
              <div className="space-y-2">
                <Label>{t("weight")}</Label>
                <Input type="number" step="any" min="0" {...form.register("weight")} />
              </div>
              <div className="space-y-2">
                <Label>{t("pricePerKg")}</Label>
                <Input type="number" step="any" min="0" {...form.register("pricePerKg")} />
              </div>
            </div>

            {/* Source of the melon (create-only, shown once the produce has a
                recorded harvested total): from the unsold pool (pool shrinks)
                or freshly picked (total produced grows, pool untouched). */}
            {!isEdit && unsoldByProduce[form.watch("produceId")] !== undefined ? (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-500/25 dark:bg-amber-500/5">
                <p className="text-sm font-medium">{t("sourceQuestion")}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFromUnsoldChoice(true)}
                    className={`rounded-md border p-2 text-left text-xs transition-colors ${
                      fromUnsold
                        ? "border-amber-400 bg-amber-100/70 dark:bg-amber-500/15"
                        : "border-input bg-background hover:bg-muted/40"
                    }`}
                  >
                    <span className="block font-medium">
                      {t("sourceUnsold", {
                        kg: unsoldByProduce[form.watch("produceId")] ?? 0,
                      })}
                    </span>
                    <span className="text-muted-foreground">{t("sourceUnsoldSub")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFromUnsoldChoice(false)}
                    className={`rounded-md border p-2 text-left text-xs transition-colors ${
                      !fromUnsold
                        ? "border-amber-400 bg-amber-100/70 dark:bg-amber-500/15"
                        : "border-input bg-background hover:bg-muted/40"
                    }`}
                  >
                    <span className="block font-medium">{t("sourceFresh")}</span>
                    <span className="text-muted-foreground">{t("sourceFreshSub")}</span>
                  </button>
                </div>
                {fromUnsold && weightNum > (unsoldByProduce[form.watch("produceId")] ?? 0) ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {t("sourceOverWarning", {
                      kg: unsoldByProduce[form.watch("produceId")] ?? 0,
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Charity donation (create-only). Still recorded as income (owner's
                company pays, default 50k/kg); flagged so reporting can highlight
                the charity portion. */}
            {!isEdit ? (
              <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-500/25 dark:bg-emerald-500/5">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-600"
                    checked={charity}
                    onChange={(e) => toggleCharity(e.target.checked)}
                  />
                  {t("charityLabel")}
                </label>
                {charity ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">{t("charityHint")}</p>
                    <div className="space-y-1">
                      <Label className="text-xs">
                        {t("charityRecipient")}{" "}
                        <span className="font-normal text-muted-foreground">{t("optional")}</span>
                      </Label>
                      <Input
                        value={charityRecipient}
                        onChange={(e) => setCharityRecipient(e.target.value)}
                        placeholder={t("charityRecipientPlaceholder")}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Packaging (optional, create-only) — consume a box/bag onto the
                cycle's usage. Not editable after the fact. */}
            {!isEdit && packagingItems.length > 0 ? (
              <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                <div className="space-y-2">
                  <Label className="text-sm">{t("packaging")}</Label>
                  <Combobox
                    value={pkgItemId}
                    onChange={(v) => pickPackaging(v)}
                    placeholder={t("packagingPlaceholder")}
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
                      <Label className="text-xs">{t("howMany", { unit: pkgItem.unit })}</Label>
                      <Input type="number" step="any" min="0" value={pkgQty} onChange={(e) => setPkgQty(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("packagingCostIs")}</Label>
                      <Select value={pkgMode} onValueChange={(v) => setPkgMode(v as "included" | "ontop")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="included">{t("includedInPrice")}</SelectItem>
                          <SelectItem value="ontop">{t("chargedOnTop")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {pkgMode === "ontop" ? (
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">{t("chargePerUnit", { unit: pkgItem.unit })}</Label>
                        <Input type="number" step="any" min="0" value={pkgCharge} onChange={(e) => setPkgCharge(e.target.value)} />
                      </div>
                    ) : null}
                    <p className="text-[11px] break-words text-muted-foreground sm:col-span-2">
                      {t("packagingNote", { qty: pkgQtyNum || 0, name: pkgItem.name })}{" "}
                      {pkgMode === "ontop" ? t("packagingOnTopNote") : t("packagingIncludedNote")}
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
                {t("customTotal")}
              </label>
              {overrideOn ? (
                <div className="flex items-center gap-2">
                  <Label className="whitespace-nowrap text-xs">{t("totalCharged")}</Label>
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
                {t("saleTotal")}{" "}
                <strong className="text-foreground">
                  Rp {finalAmount.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                </strong>
                {overrideOn && Math.abs(finalAmount - autoTotal) > 0.005 ? (
                  <span className="text-xs text-muted-foreground">
                    {" "}({t("listLabel")} Rp {autoTotal.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                    {finalAmount < autoTotal
                      ? ` · ${t("discountLabel")} Rp ${(autoTotal - finalAmount).toLocaleString("id-ID", { maximumFractionDigits: 2 })}`
                      : ` · +Rp ${(finalAmount - autoTotal).toLocaleString("id-ID", { maximumFractionDigits: 2 })}`}
                    )
                  </span>
                ) : onTopExtra > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {" "}{t("inclPackaging", { amount: onTopExtra.toLocaleString("id-ID") })}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>{tCommon("cancel")}</Button>
            <Button type="submit" disabled={pending}>{pending ? t("saving") : isEdit ? t("save") : t("log")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
