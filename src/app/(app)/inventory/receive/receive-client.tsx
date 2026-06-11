"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import {
  createItemQuick,
  createSupplierQuick,
  receiveStockBulk,
} from "@/app/(app)/inventory/actions";

type ItemOpt = {
  id: string;
  name: string;
  unit: string;
  /** Pack sub-unit ("metres" / "pieces") for items sold as a pack — null on
   *  regular discrete items. Drives the qty input label + conversion. */
  subUnit: string | null;
  subFactor: number | null;
};
type SupplierOpt = { id: string; name: string };
type ItemHistory = { lastSupplierId: string | null; lastPrice: string; lastDate: string };
type SupplierChip = {
  itemId: string;
  itemName: string;
  unit: string;
  lastPrice: string;
  lastDate: string;
};

type Line = {
  itemId: string | null;
  qty: string;
  price: string;
  reusable: boolean;
  maxUses: string;
};

const newLine = (): Line => ({
  itemId: null,
  qty: "1",
  price: "0",
  reusable: false,
  maxUses: "1",
});

const todayStr = () => new Date().toISOString().slice(0, 10);

export function ReceiveStockClient({
  items: initialItems,
  suppliers: initialSuppliers,
  defaultExchangeRate,
  itemHistory,
  supplierHistory,
}: {
  items: ItemOpt[];
  suppliers: SupplierOpt[];
  defaultExchangeRate: string;
  itemHistory: Record<string, ItemHistory>;
  supplierHistory: Record<string, SupplierChip[]>;
}) {
  const t = useTranslations("receive");
  const tc = useTranslations("common");
  const router = useRouter();
  const [items, setItems] = useState<ItemOpt[]>(initialItems);
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>(initialSuppliers);
  const [date, setDate] = useState(todayStr());
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [exchangeRate, setExchangeRate] = useState(defaultExchangeRate);
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [pending, startTransition] = useTransition();

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const prevFromSupplier: SupplierChip[] = supplierId ? supplierHistory[supplierId] ?? [] : [];
  const usedItemIds = new Set(lines.map((l) => l.itemId).filter(Boolean) as string[]);

  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine(prefill?: Partial<Line>) {
    setLines((prev) => [...prev, { ...newLine(), ...prefill }]);
  }

  function removeLine(idx: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  /** Re-use an item the chosen supplier has previously sold us — pre-fills
   * the last unit price so the staff doesn't have to retype. Drops into an
   * empty line if the current first row is blank, otherwise appends. */
  function quickAddFromHistory(chip: SupplierChip) {
    if (usedItemIds.has(chip.itemId)) {
      toast.error(t("alreadyOnReceipt", { name: chip.itemName }));
      return;
    }
    const emptyIdx = lines.findIndex((l) => !l.itemId);
    if (emptyIdx >= 0) {
      updateLine(emptyIdx, { itemId: chip.itemId, price: chip.lastPrice });
    } else {
      addLine({ itemId: chip.itemId, price: chip.lastPrice });
    }
  }

  /** When an item with prior history is picked manually, also pre-fill the
   * unit price from its last batch (only if the staff hasn't already typed). */
  function pickItem(idx: number, newItemId: string | null) {
    const line = lines[idx];
    const patch: Partial<Line> = { itemId: newItemId };
    if (newItemId && itemHistory[newItemId] && (line.price === "0" || line.price === "")) {
      patch.price = itemHistory[newItemId].lastPrice;
    }
    updateLine(idx, patch);
  }

  async function handleCreateItem(idx: number, typed: string) {
    const r = await createItemQuick(typed);
    if (r.ok && r.data) {
      // Quick-create items default to discrete (no sub-unit) — staff can
      // edit the item afterwards to add pack info if needed.
      const newItem: ItemOpt = {
        id: r.data.id,
        name: r.data.name,
        unit: r.data.unit,
        subUnit: null,
        subFactor: null,
      };
      setItems((prev) => [...prev, newItem].sort((a, b) => a.name.localeCompare(b.name)));
      updateLine(idx, { itemId: newItem.id });
      toast.success(t("createdToast", { name: newItem.name }));
    } else if (!r.ok) {
      toast.error(r.error);
    }
  }

  async function handleCreateSupplier(typed: string) {
    const r = await createSupplierQuick(typed);
    if (r.ok && r.data) {
      const newSup: SupplierOpt = { id: r.data.id, name: r.data.name };
      setSuppliers((prev) => [...prev, newSup].sort((a, b) => a.name.localeCompare(b.name)));
      setSupplierId(newSup.id);
      toast.success(t("createdToast", { name: newSup.name }));
    } else if (!r.ok) {
      toast.error(r.error);
    }
  }

  function totalLines(): number {
    return lines.filter((l) => l.itemId && Number(l.qty) > 0).length;
  }

  function totalCost(): string {
    // For pack items the user typed sub-units; the line's contribution to
    // total cost is (typedQty / subFactor) × pricePerPack. For non-pack
    // items it's the plain qty × price.
    const sum = lines.reduce((s, l) => {
      if (!l.itemId) return s;
      const it = itemMap.get(l.itemId);
      const qtyNum = Number(l.qty);
      const priceNum = Number(l.price);
      if (it?.subFactor && it.subFactor > 0) {
        return s + (qtyNum / it.subFactor) * priceNum;
      }
      return s + qtyNum * priceNum;
    }, 0);
    return sum.toFixed(2);
  }

  function handleSubmit() {
    const validLines = lines.filter((l) => l.itemId && Number(l.qty) > 0);
    if (validLines.length === 0) {
      toast.error(t("needLine"));
      return;
    }
    startTransition(async () => {
      const r = await receiveStockBulk({
        date,
        supplierId,
        exchangeRate: exchangeRate || "1",
        lines: validLines.map((l) => {
          // For pack items the user typed sub-units (e.g. 50 pieces of a
          // 50-pcs polybag); convert to packs (1 pack) before the action
          // hits the DB.
          const it = itemMap.get(l.itemId!);
          const qtyToSend =
            it?.subFactor && it.subFactor > 0
              ? (Number(l.qty) / it.subFactor).toString()
              : l.qty;
          return {
            itemId: l.itemId!,
            qty: qtyToSend,
            price: l.price,
            maxUses: l.reusable ? Math.max(1, Number(l.maxUses) || 1) : 1,
          };
        }),
      });
      if (r.ok && r.data) {
        toast.success(t("receivedToast", { count: r.data.lineCount }));
        router.push("/inventory");
        router.refresh();
      } else if (!r.ok) {
        toast.error(r.error);
      }
    });
  }

  // Build item-picker options once — annotate each with a hint of the last
  // supplier + price so the staff sees prior context before clicking. Pack
  // items get a "pack of N pieces" tag so it's clear this item is roll/bag
  // style before clicking.
  const itemOptions = useMemo(() => {
    const supById = new Map(suppliers.map((s) => [s.id, s.name]));
    return items.map((i) => {
      const h = itemHistory[i.id];
      const packTag =
        i.subUnit && i.subFactor && i.subFactor > 0
          ? t("packOf", { unit: i.unit, n: i.subFactor, sub: i.subUnit })
          : i.unit;
      let desc = packTag;
      if (h) {
        const sup = h.lastSupplierId ? supById.get(h.lastSupplierId) : null;
        const last = sup
          ? t("lastWithSupplier", { price: h.lastPrice, supplier: sup, date: h.lastDate })
          : t("lastNoSupplier", { price: h.lastPrice, date: h.lastDate });
        desc = `${packTag} · ${last}`;
      }
      return { value: i.id, label: i.name, description: desc };
    });
  }, [items, suppliers, itemHistory, t]);

  return (
    <>
      {/* Step 1 — Header form. Compact two-row layout: date+supplier on top,
          exchange rate below + dim because it's pre-filled from settings. */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
              1
            </span>
            {t("step1")}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr]">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("dateLabel")}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("supplierLabel")}</Label>
              <Combobox
                value={supplierId}
                onChange={(v) => setSupplierId(v)}
                placeholder={t("supplierPlaceholder")}
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                onCreate={handleCreateSupplier}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("exchangeRate")}</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 2 — Quick-add chips for items previously bought from the
          chosen supplier, so the staff doesn't have to search blindly. */}
      {supplierId && prevFromSupplier.length > 0 ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              {t("prevFromSupplier")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {prevFromSupplier.map((chip) => {
                const taken = usedItemIds.has(chip.itemId);
                return (
                  <button
                    key={chip.itemId}
                    type="button"
                    onClick={() => quickAddFromHistory(chip)}
                    disabled={taken}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition",
                      taken
                        ? "cursor-not-allowed border-dashed bg-muted/40 text-muted-foreground/60 line-through"
                        : "border-accent/40 bg-accent/10 text-foreground hover:border-accent hover:bg-accent/20",
                    )}
                    title={t("chipTitle", {
                      date: chip.lastDate,
                      price: chip.lastPrice,
                      unit: chip.unit,
                    })}
                  >
                    {chip.itemName}
                    <span className="ml-1.5 text-[10px] text-muted-foreground">
                      {chip.lastPrice}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">{t("prevHint")}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Step 3 — Lines. Hidden behind a numbered step header so the eye
          travels top-to-bottom and the page doesn't feel like a wall of
          form. */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                2
              </span>
              {t("step2")}
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => addLine()}>
              <Plus className="h-3.5 w-3.5" /> {t("addLine")}
            </Button>
          </div>

          <div className="space-y-2">
            {lines.map((line, idx) => {
              const item = line.itemId ? itemMap.get(line.itemId) : null;
              return (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 rounded-lg border bg-background/40 p-2.5 sm:grid-cols-[3fr_1fr_1.2fr_1.2fr_1.5fr_auto]"
                >
                  <Combobox
                    value={line.itemId}
                    onChange={(v) => pickItem(idx, v)}
                    placeholder={t("itemPlaceholder")}
                    options={itemOptions}
                    onCreate={(typed) => handleCreateItem(idx, typed)}
                  />
                  <div className="space-y-0.5">
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={line.qty}
                      onChange={(e) => updateLine(idx, { qty: e.target.value })}
                      placeholder={
                        item?.subUnit && item.subFactor
                          ? t("qtySubPlaceholder", { sub: item.subUnit })
                          : t("qtyPlaceholder")
                      }
                      title={
                        item?.subUnit && item.subFactor
                          ? t("qtySubTitle", { sub: item.subUnit })
                          : t("qtyTitle")
                      }
                    />
                    {item?.subFactor &&
                    item.subFactor > 0 &&
                    Number(line.qty) > 0 ? (
                      <p className="text-[10px] text-muted-foreground">
                        = {(Number(line.qty) / item.subFactor).toFixed(2)}{" "}
                        {item.unit}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-0.5">
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={line.price}
                      onChange={(e) => updateLine(idx, { price: e.target.value })}
                      placeholder={
                        item
                          ? t("priceItemPlaceholder", { unit: item.unit })
                          : t("pricePlaceholder")
                      }
                      title={t("priceTitle")}
                    />
                    {item?.subFactor &&
                    item.subFactor > 0 &&
                    Number(line.price) > 0 ? (
                      <p className="text-[10px] text-muted-foreground">
                        ={" "}
                        {(Number(line.price) / item.subFactor).toFixed(2)}{" "}
                        / {item.subUnit}
                      </p>
                    ) : null}
                  </div>
                  {/* "Total paid" two-way binds with qty × unit price — match
                      what Shopee/Tokopedia invoices print as line subtotal.
                      Type the total; we back-calc the unit price (more
                      accurate when the invoice rounds differently than the
                      per-unit math). */}
                  <div className="space-y-0.5">
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={
                        Number(line.qty) > 0 && Number(line.price) > 0
                          ? (Number(line.qty) * Number(line.price)).toFixed(0)
                          : ""
                      }
                      onChange={(e) => {
                        const total = Number(e.target.value);
                        const qty = Number(line.qty);
                        if (qty > 0 && total > 0) {
                          updateLine(idx, {
                            price: (total / qty).toFixed(4),
                          });
                        }
                      }}
                      placeholder={t("lineTotalPlaceholder")}
                      title={t("lineTotalTitle")}
                    />
                  </div>
                  <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/20 px-2.5">
                    <Switch
                      checked={line.reusable}
                      onCheckedChange={(v) => updateLine(idx, { reusable: v })}
                    />
                    <span className="text-xs text-muted-foreground">{t("reusable")}</span>
                    {line.reusable ? (
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        value={line.maxUses}
                        onChange={(e) => updateLine(idx, { maxUses: e.target.value })}
                        className="h-7 w-14"
                        placeholder={t("maxUsesPlaceholder")}
                        title={t("maxUsesTitle")}
                      />
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeLine(idx)}
                    disabled={lines.length === 1}
                    title={t("removeLine")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  {item && line.reusable && Number(line.price) > 0 && Number(line.maxUses) > 0 ? (
                    <div className="col-span-full -mt-1 text-[10px] text-muted-foreground sm:col-span-5">
                      {t("costPerUse")}{" "}
                      <strong className="text-foreground">
                        {(Number(line.price) / Number(line.maxUses)).toFixed(2)}
                      </strong>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <div className="text-sm text-muted-foreground">
          <strong className="text-foreground">
            {t("summaryLines", { count: totalLines() })}
          </strong>{" "}
          · {t("summaryTotal")}{" "}
          <strong className="text-foreground">{totalCost()}</strong>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost">
            <Link href="/inventory">{tc("cancel")}</Link>
          </Button>
          <Button onClick={handleSubmit} disabled={pending || totalLines() === 0}>
            {pending ? t("receiving") : t("submit", { count: totalLines() })}
          </Button>
        </div>
      </div>
    </>
  );
}
