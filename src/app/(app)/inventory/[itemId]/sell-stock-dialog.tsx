"use client";

import { useState, useTransition } from "react";
import { todayWIB } from "@/lib/date";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { HandCoins } from "lucide-react";
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
import { sellStock } from "@/app/(app)/inventory/actions";

const today = () => todayWIB();

/**
 * Sell stock straight to a buyer — no greenhouse involved. "Pak Budi
 * wants 10 metres of the drip pipe."
 *
 * Pack-aware like the install dialog: when the item has sub-unit info
 * (1 roll = 100 metres) the quantity input asks for metres and converts
 * to pack units before calling the action. The buyer is a free-text
 * name by design — upgrade to a proper Buyer entity later if reselling
 * becomes a real side business.
 */
export function SellStockDialog({
  itemId,
  itemUnit,
  itemSubUnit,
  itemSubFactor,
  /** On-hand stock in PACK units. */
  maxPacks,
}: {
  itemId: string;
  itemUnit: string;
  itemSubUnit?: string | null;
  itemSubFactor?: number | null;
  maxPacks: string;
}) {
  const t = useTranslations("sellStock");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const [qty, setQty] = useState("");
  const [amount, setAmount] = useState("");
  const [buyer, setBuyer] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());
  const router = useRouter();

  const isPack = !!(itemSubUnit && itemSubFactor && itemSubFactor > 0);
  const qtyUnitLabel = isPack ? (itemSubUnit as string) : itemUnit;
  const maxInEntryUnits = isPack
    ? Number(maxPacks) * (itemSubFactor as number)
    : Number(maxPacks);
  const qtyNum = /^[0-9.]+$/.test(qty) ? Number(qty) : 0;
  const amountNum = /^[0-9.]+$/.test(amount) ? Number(amount) : 0;
  const perUnitPreview =
    qtyNum > 0 && amountNum > 0 ? (amountNum / qtyNum).toFixed(2) : null;
  const overStock = qtyNum > maxInEntryUnits;

  function reset() {
    setQty("");
    setAmount("");
    setBuyer("");
    setNote("");
    setDate(today());
  }

  function submit() {
    if (qtyNum <= 0 || amountNum <= 0) {
      toast.error(t("errNeedBoth"));
      return;
    }
    if (overStock) {
      toast.error(
        t("errOnlyOnHand", {
          max: maxInEntryUnits.toFixed(0),
          unit: qtyUnitLabel,
        }),
      );
      return;
    }
    // Convert sub-units → pack units; the FIFO ledger runs in packs.
    const qtyPacks = isPack ? qtyNum / (itemSubFactor as number) : qtyNum;
    startT(async () => {
      const r = await sellStock({
        itemId,
        date,
        qty: String(qtyPacks),
        amount: String(amountNum),
        buyer: buyer.trim() || undefined,
        note: note.trim() || undefined,
      });
      if (r.ok && r.data) {
        const profit = Number(r.data.profit);
        const formatted = Math.abs(Math.round(profit)).toLocaleString("id-ID");
        toast.success(
          profit >= 0
            ? t("toastProfit", { amount: formatted })
            : t("toastLoss", { amount: formatted }),
        );
        setOpen(false);
        reset();
        router.refresh();
      } else if (!r.ok) {
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
        <Button variant="outline">
          <HandCoins className="h-4 w-4" /> {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {t("intro")}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>
                {t("qtyLabel", { unit: qtyUnitLabel })}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  {t("maxHint", { max: maxInEntryUnits.toFixed(0) })}
                </span>
              </Label>
              <Input
                type="number"
                step="any"
                min="0"
                autoFocus
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder={t("qtyPlaceholder", {
                  max: maxInEntryUnits.toFixed(0),
                })}
              />
              {overStock ? (
                <p className="text-xs text-destructive">{t("overStock")}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>{t("paidLabel")}</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t("paidPlaceholder")}
              />
              {perUnitPreview ? (
                <p className="text-[11px] text-muted-foreground">
                  {t("perUnit", { price: perUnitPreview, unit: qtyUnitLabel })}
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("buyerLabel")}</Label>
              <Input
                value={buyer}
                onChange={(e) => setBuyer(e.target.value)}
                placeholder={t("buyerPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("dateLabel")}</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("noteLabel")}</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("notePlaceholder")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            {tc("cancel")}
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={pending || qtyNum <= 0 || amountNum <= 0 || overStock}
          >
            <HandCoins className="h-4 w-4" />
            {pending ? t("recording") : t("record")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
