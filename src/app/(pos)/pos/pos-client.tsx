"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Pencil,
  Plus,
  Receipt,
  ShoppingBag,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { todayWIB } from "@/lib/date";
import { MoneyDualClient } from "@/components/shared/money-client";
import { LangToggle } from "@/components/shared/lang-toggle";
import { createCustomerQuick } from "@/app/(app)/harvest/actions";

import { NumpadInput } from "./numpad-input";
import { PaymentPanel, type PaymentResult } from "./payment-panel";
import { recordPosSale } from "./actions";

type Produce = { id: string; name: string };
type Cycle = { id: string; label: string; produces: Produce[] };
type Customer = { id: string; name: string; type: string };
type PackagingItem = { id: string; name: string; unit: string; cost: string };
type Grade = "A" | "B" | "C" | "D";

type CartLine = {
  id: string;
  produceId: string;
  produceName: string;
  grade: Grade;
  weight: string;
  pricePerKg: string;
  packagingItemId?: string;
  packagingItemName?: string;
  packagingQty?: string;
  packagingMode?: "included" | "ontop";
  packagingChargePerUnit?: string;
};

const GRADES: Grade[] = ["A", "B", "C", "D"];
const num = (v: string) => Number(v) || 0;

/** Natural charged amount for a line (weight × price + any on-top packaging). */
function naturalOf(l: {
  weight: string;
  pricePerKg: string;
  packagingItemId?: string;
  packagingMode?: "included" | "ontop";
  packagingQty?: string;
  packagingChargePerUnit?: string;
}): number {
  let amt = num(l.weight) * num(l.pricePerKg);
  if (l.packagingItemId && l.packagingMode === "ontop") {
    amt += num(l.packagingChargePerUnit || "0") * num(l.packagingQty || "0");
  }
  return amt;
}

export function PosClient({
  cycles,
  allProduce,
  customers: initialCustomers,
  packagingItems,
  exchangeRate,
  priceDefaults,
}: {
  cycles: Cycle[];
  allProduce: Produce[];
  customers: Customer[];
  packagingItems: PackagingItem[];
  exchangeRate: string | null;
  priceDefaults: Record<string, string>;
}) {
  const t = useTranslations("pos");
  const tCommon = useTranslations("common");

  const [harvestId, setHarvestId] = useState<string>(cycles[0]?.id ?? "");
  const [cart, setCart] = useState<CartLine[]>([]);
  const lineSeq = useRef(0);

  // Line editor state.
  const [produceId, setProduceId] = useState("");
  const [grade, setGrade] = useState<Grade>("A");
  const [weight, setWeight] = useState("");
  const [price, setPrice] = useState("");
  const [editField, setEditField] = useState<"weight" | "price">("weight");
  const [editingId, setEditingId] = useState<string | null>(null);
  // Optional packaging for the line being built.
  const [pkgOpen, setPkgOpen] = useState(false);
  const [pkgItemId, setPkgItemId] = useState<string | null>(null);
  const [pkgQty, setPkgQty] = useState("1");
  const [pkgMode, setPkgMode] = useState<"included" | "ontop">("included");
  const [pkgCharge, setPkgCharge] = useState("");

  // Customer (whole cart).
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [newType, setNewType] = useState("CONSUMER");

  // Cart-level custom total (haggled round number). Optional.
  const [discountOn, setDiscountOn] = useState(false);
  const [discountAmount, setDiscountAmount] = useState("");
  // Until staff type their own figure, keep the custom total in step with the
  // cart so items added AFTER enabling it aren't silently given away.
  const [discountTouched, setDiscountTouched] = useState(false);

  const [phase, setPhase] = useState<"cart" | "pay" | "done">("cart");
  const [pending, startT] = useTransition();
  const [done, setDone] = useState<{ paymentId: string; changeDue?: string } | null>(null);

  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const cycle = cycles.find((c) => c.id === harvestId) ?? null;
  const produceOptions = cycle && cycle.produces.length > 0 ? cycle.produces : allProduce;

  const CUSTOMER_TYPES = [
    { value: "RETAILER", label: t("typeRetailer") },
    { value: "WHOLESALER", label: t("typeWholesaler") },
    { value: "CONSUMER", label: t("typeConsumer") },
  ];
  const typeLabel = (ty: string) => CUSTOMER_TYPES.find((x) => x.value === ty)?.label ?? ty;

  const naturalTotal = useMemo(() => cart.reduce((s, l) => s + naturalOf(l), 0), [cart]);
  // Custom total: until staff type their own figure it tracks the cart (derived,
  // so adding an item after enabling it can't silently undercharge); once typed,
  // it sticks.
  const customTotalStr = discountOn
    ? discountTouched
      ? discountAmount.trim()
      : String(Math.round(naturalTotal))
    : "";
  const discountValid = discountOn && /^[0-9]+(\.[0-9]+)?$/.test(customTotalStr);
  const effectiveTotal = discountValid ? num(customTotalStr) : naturalTotal;

  const editorTotal = naturalOf({
    weight,
    pricePerKg: price,
    packagingItemId: pkgItemId ?? undefined,
    packagingMode: pkgMode,
    packagingQty: pkgQty,
    packagingChargePerUnit: pkgCharge,
  });
  const canAdd = produceId !== "" && num(weight) > 0 && num(price) > 0;

  function applyDefaultPrice(pid: string, g: Grade) {
    const d = priceDefaults[`${pid}:${g}`];
    if (d) setPrice(d);
  }

  function pickProduce(v: string | null) {
    const pid = v ?? "";
    setProduceId(pid);
    if (pid) applyDefaultPrice(pid, grade);
  }
  function pickGrade(g: Grade) {
    setGrade(g);
    if (produceId) applyDefaultPrice(produceId, g);
  }
  function pickPackaging(id: string | null) {
    setPkgItemId(id);
    const it = packagingItems.find((p) => p.id === id);
    if (it && !pkgCharge) setPkgCharge(it.cost);
  }

  function resetEditor() {
    setProduceId("");
    setWeight("");
    setPrice("");
    setEditField("weight");
    setEditingId(null);
    setPkgOpen(false);
    setPkgItemId(null);
    setPkgQty("1");
    setPkgMode("included");
    setPkgCharge("");
  }

  function commitLine() {
    if (!canAdd) return;
    const produceName = produceOptions.find((p) => p.id === produceId)?.name ?? "";
    const pkgName = packagingItems.find((p) => p.id === pkgItemId)?.name;
    const line: CartLine = {
      id: editingId ?? `l${lineSeq.current++}`,
      produceId,
      produceName,
      grade,
      weight,
      pricePerKg: price,
      packagingItemId: pkgItemId ?? undefined,
      packagingItemName: pkgName,
      packagingQty: pkgItemId ? pkgQty : undefined,
      packagingMode: pkgItemId ? pkgMode : undefined,
      packagingChargePerUnit: pkgItemId && pkgMode === "ontop" ? pkgCharge : undefined,
    };
    setCart((prev) => (editingId ? prev.map((l) => (l.id === editingId ? line : l)) : [...prev, line]));
    resetEditor();
  }

  function editLine(l: CartLine) {
    setEditingId(l.id);
    setProduceId(l.produceId);
    setGrade(l.grade);
    setWeight(l.weight);
    setPrice(l.pricePerKg);
    setEditField("weight");
    // Load THIS line's packaging, clearing any staged packaging first — otherwise
    // a line with no packaging would inherit whatever was left in the editor
    // (silent overcharge + a phantom box consumed from stock).
    if (l.packagingItemId) {
      setPkgOpen(true);
      setPkgItemId(l.packagingItemId);
      setPkgQty(l.packagingQty ?? "1");
      setPkgMode(l.packagingMode ?? "included");
      setPkgCharge(l.packagingChargePerUnit ?? "");
    } else {
      setPkgOpen(false);
      setPkgItemId(null);
      setPkgQty("1");
      setPkgMode("included");
      setPkgCharge("");
    }
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function removeLine(id: string) {
    setCart((prev) => prev.filter((l) => l.id !== id));
    if (editingId === id) resetEditor();
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

  function openPayment() {
    if (cart.length === 0) {
      toast.error(t("emptyCart"));
      return;
    }
    if (!online) {
      toast.error(t("offlineWarning"));
      return;
    }
    setPhase("pay");
  }

  function confirmPayment(result: PaymentResult) {
    startT(async () => {
      const r = await recordPosSale({
        harvestId,
        date: todayWIB(),
        customerId: customerId || undefined,
        method: result.method,
        tendered: result.tendered,
        changeDue: result.changeDue,
        reference: result.reference,
        discountTotal: discountValid ? customTotalStr : undefined,
        lines: cart.map((l) => ({
          produceId: l.produceId,
          grade: l.grade,
          weight: l.weight,
          pricePerKg: l.pricePerKg,
          packagingItemId: l.packagingItemId,
          packagingQty: l.packagingQty,
          packagingMode: l.packagingMode,
          packagingChargePerUnit: l.packagingChargePerUnit,
        })),
      });
      if (r.ok && r.data) {
        setDone({ paymentId: r.data.paymentId, changeDue: result.changeDue });
        setPhase("done");
      } else if (!r.ok) {
        toast.error(r.error);
        setPhase("cart"); // keep the cart intact so staff can retry
      }
    });
  }

  function newSale() {
    setCart([]);
    setCustomerId(null);
    setDiscountOn(false);
    setDiscountAmount("");
    setDiscountTouched(false);
    resetEditor();
    setDone(null);
    setPhase("cart");
  }

  // ---- No live cycles -------------------------------------------------------
  if (cycles.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <ShoppingBag className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{t("noCyclesTitle")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t("noCyclesBody")}</p>
        <Button asChild>
          <Link href="/harvest">{t("goToGreenhouses")}</Link>
        </Button>
      </div>
    );
  }

  // ---- Success --------------------------------------------------------------
  if (phase === "done" && done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <Check className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-semibold">{t("saleComplete")}</h1>
        <div className="text-3xl font-bold">
          <MoneyDualClient value={String(Math.round(effectiveTotal))} exchangeRate={exchangeRate} align="start" />
        </div>
        {done.changeDue ? (
          <div className="rounded-lg bg-emerald-500/10 px-4 py-2 text-emerald-700 dark:text-emerald-300">
            {t("changeDue")}: <strong>Rp {num(done.changeDue).toLocaleString("id-ID")}</strong>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" onClick={newSale}>
            <Plus className="mr-1 h-4 w-4" /> {t("newSale")}
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href={`/print/receipt/${done.paymentId}?auto=1`} target="_blank" rel="noopener noreferrer">
              <Receipt className="mr-1 h-4 w-4" /> {t("receipt")}
            </a>
          </Button>
        </div>
      </div>
    );
  }

  // ---- Register -------------------------------------------------------------
  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <Button variant="ghost" size="icon" asChild aria-label={t("backToApp")}>
          <Link href="/">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="flex-1 text-lg font-semibold">{t("title")}</h1>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium",
            online ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive",
          )}
        >
          {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {online ? t("online") : t("offline")}
        </span>
        <LangToggle />
      </header>

      <div className="mx-auto grid max-w-5xl gap-4 p-4 lg:grid-cols-2">
        {/* ---- Left: cycle + line editor ---- */}
        <section className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <Label className="text-xs text-muted-foreground">{t("sellingFrom")}</Label>
            <div className="mt-1">
              <Combobox
                value={harvestId}
                onChange={(v) => {
                  if (v && v !== harvestId && cart.length > 0) {
                    if (!window.confirm(t("changeCycleWarning"))) return;
                  }
                  setHarvestId(v ?? "");
                  resetEditor();
                }}
                options={cycles.map((c) => ({ value: c.id, label: c.label }))}
                placeholder={t("pickCycle")}
              />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{editingId ? t("editItem") : t("addItem")}</h2>
              {editingId ? (
                <Button variant="ghost" size="sm" onClick={resetEditor}>
                  {tCommon("cancel")}
                </Button>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("produce")}</Label>
                <Combobox
                  value={produceId || null}
                  onChange={pickProduce}
                  options={produceOptions.map((p) => ({ value: p.id, label: p.name }))}
                  placeholder={t("pickProduce")}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("grade")}</Label>
                <div className="grid grid-cols-4 gap-2">
                  {GRADES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => pickGrade(g)}
                      className={cn(
                        "h-10 rounded-md border text-sm font-semibold transition",
                        grade === g ? "border-accent bg-accent/10" : "hover:bg-muted",
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Weight / price toggle + keypad */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEditField("weight")}
                  className={cn(
                    "rounded-md border p-2 text-left",
                    editField === "weight" ? "border-accent bg-accent/5" : "",
                  )}
                >
                  <div className="text-[11px] text-muted-foreground">{t("weightKg")}</div>
                  <div className="text-lg font-semibold">{weight || "0"}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setEditField("price")}
                  className={cn(
                    "rounded-md border p-2 text-left",
                    editField === "price" ? "border-accent bg-accent/5" : "",
                  )}
                >
                  <div className="text-[11px] text-muted-foreground">{t("pricePerKg")}</div>
                  <div className="text-lg font-semibold">{price ? `Rp ${num(price).toLocaleString("id-ID")}` : "—"}</div>
                </button>
              </div>
              <NumpadInput
                value={editField === "weight" ? weight : price}
                onChange={editField === "weight" ? setWeight : setPrice}
              />

              {/* Optional packaging */}
              {packagingItems.length > 0 ? (
                <div className="rounded-md border bg-muted/20 p-3">
                  <button
                    type="button"
                    onClick={() => setPkgOpen((o) => !o)}
                    className="flex w-full items-center justify-between text-xs font-medium"
                  >
                    <span>{t("packaging")}</span>
                    <span className="text-muted-foreground">{pkgOpen ? "−" : "+"}</span>
                  </button>
                  {pkgOpen ? (
                    <div className="mt-3 space-y-2">
                      <Combobox
                        value={pkgItemId}
                        onChange={pickPackaging}
                        options={packagingItems.map((p) => ({
                          value: p.id,
                          label: p.name,
                          description: `≈ Rp ${num(p.cost).toLocaleString("id-ID")} / ${p.unit}`,
                        }))}
                        placeholder={t("packagingPlaceholder")}
                      />
                      {pkgItemId ? (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[11px]">{t("packagingQty")}</Label>
                            <Input type="number" step="any" min="0" value={pkgQty} onChange={(e) => setPkgQty(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px]">{t("packagingCostIs")}</Label>
                            <Select value={pkgMode} onValueChange={(v) => setPkgMode(v as "included" | "ontop")}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="included">{t("includedInPrice")}</SelectItem>
                                <SelectItem value="ontop">{t("chargedOnTop")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {pkgMode === "ontop" ? (
                            <div className="col-span-2 space-y-1">
                              <Label className="text-[11px]">{t("chargePerUnit")}</Label>
                              <Input type="number" step="any" min="0" value={pkgCharge} onChange={(e) => setPkgCharge(e.target.value)} />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t("lineTotal")}</span>
                <MoneyDualClient value={String(Math.round(editorTotal))} exchangeRate={exchangeRate} />
              </div>

              <Button className="h-12 w-full" disabled={!canAdd} onClick={commitLine}>
                <Plus className="mr-1 h-4 w-4" /> {editingId ? t("updateItem") : t("addToCart")}
              </Button>
            </div>
          </div>
        </section>

        {/* ---- Right: cart ---- */}
        <section className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">{t("cart")}</h2>
            {cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("cartEmpty")}</p>
            ) : (
              <ul className="divide-y">
                {cart.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {l.produceName} · {t("gradeShort")} {l.grade}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {l.weight} {t("kg")} × Rp {num(l.pricePerKg).toLocaleString("id-ID")}
                        {l.packagingItemName && l.packagingMode === "ontop" ? ` · +${l.packagingItemName}` : ""}
                      </div>
                    </div>
                    <MoneyDualClient value={String(Math.round(naturalOf(l)))} exchangeRate={exchangeRate} />
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editLine(l)} aria-label={t("editItem")}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeLine(l.id)} aria-label={tCommon("delete")}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Customer */}
          <div className="rounded-xl border bg-card p-4">
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)] gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {t("customer")} <span className="text-muted-foreground">{t("optional")}</span>
                </Label>
                <Combobox
                  value={customerId}
                  onChange={setCustomerId}
                  options={customers.map((c) => ({ value: c.id, label: c.name, description: typeLabel(c.type) }))}
                  placeholder={t("searchOrAddCustomer")}
                  onCreate={handleCreateCustomer}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("newCustomerType")}</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CUSTOMER_TYPES.map((ty) => (
                      <SelectItem key={ty.value} value={ty.value}>{ty.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Discount / custom total */}
          <div className="rounded-xl border bg-card p-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-foreground"
                checked={discountOn}
                onChange={(e) => {
                  setDiscountOn(e.target.checked);
                  setDiscountTouched(false); // re-sync to the cart until edited
                }}
              />
              {t("customTotal")}
            </label>
            {discountOn ? (
              <div className="mt-2 flex items-center gap-2">
                <Label className="whitespace-nowrap text-xs">{t("totalCharged")}</Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={discountTouched ? discountAmount : String(Math.round(naturalTotal))}
                  onChange={(e) => {
                    setDiscountAmount(e.target.value);
                    setDiscountTouched(true);
                  }}
                  className="h-9"
                />
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 p-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground">
              {t("itemsCount", { count: cart.length })}
              {discountValid && effectiveTotal !== naturalTotal ? ` · ${t("wasLabel")} Rp ${Math.round(naturalTotal).toLocaleString("id-ID")}` : ""}
            </div>
            <div className="text-xl font-bold">
              <MoneyDualClient value={String(Math.round(effectiveTotal))} exchangeRate={exchangeRate} align="start" />
            </div>
          </div>
          <Button size="lg" className="h-14 px-8 text-base" disabled={cart.length === 0 || !online || pending} onClick={openPayment}>
            {t("charge")}
          </Button>
        </div>
      </div>

      {phase === "pay" ? (
        <PaymentPanel
          amountIDR={String(Math.round(effectiveTotal))}
          exchangeRate={exchangeRate}
          onConfirm={confirmPayment}
          onCancel={() => setPhase("cart")}
          pending={pending}
        />
      ) : null}
    </div>
  );
}
