"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Banknote, CreditCard, QrCode, ArrowLeftRight, X, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MoneyDualClient } from "@/components/shared/money-client";

import { NumpadInput } from "./numpad-input";

export type PaymentResult = {
  method: "CASH" | "QRIS" | "CARD" | "TRANSFER";
  tendered?: string;
  changeDue?: string;
  reference?: string;
};

type PanelProps = {
  amountIDR: string;
  exchangeRate: string | null;
  onConfirm: (r: PaymentResult) => void;
  pending: boolean;
};

/**
 * The payment step, rendered as a pluggable panel. v1 ships Cash (change calc)
 * and record-only QRIS / Card / Transfer. The QRIS and Card panels carry the
 * seam for Phase 2/3 live charging: they already receive `amountIDR` + `onConfirm`,
 * so the live QR / hosted-checkout flow drops in without touching the register.
 */
export function PaymentPanel({
  amountIDR,
  exchangeRate,
  onConfirm,
  onCancel,
  pending,
}: {
  amountIDR: string;
  exchangeRate: string | null;
  onConfirm: (r: PaymentResult) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const t = useTranslations("pos");
  const [method, setMethod] = useState<PaymentResult["method"]>("CASH");

  const tiles: { key: PaymentResult["method"]; label: string; icon: typeof Banknote }[] = [
    { key: "CASH", label: t("payCash"), icon: Banknote },
    { key: "QRIS", label: t("qris"), icon: QrCode },
    { key: "CARD", label: t("card"), icon: CreditCard },
    { key: "TRANSFER", label: t("transfer"), icon: ArrowLeftRight },
  ];

  const panelProps: PanelProps = { amountIDR, exchangeRate, onConfirm, pending };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("amountDue")}</div>
          <div className="text-2xl font-bold">
            <MoneyDualClient value={amountIDR} exchangeRate={exchangeRate} align="start" />
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onCancel} disabled={pending} aria-label={t("back")}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-2 border-b p-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const active = method === tile.key;
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => setMethod(tile.key)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border p-3 text-xs font-medium transition",
                active ? "border-accent bg-accent/10 text-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="h-5 w-5" />
              {tile.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {method === "CASH" ? <CashPanel {...panelProps} /> : null}
        {method === "QRIS" ? <QrisPanel {...panelProps} /> : null}
        {method === "CARD" ? <CardPanel {...panelProps} /> : null}
        {method === "TRANSFER" ? <TransferPanel {...panelProps} /> : null}
      </div>
    </div>
  );
}

/** Cash: enter what the customer handed over, see the change to give back. */
function CashPanel({ amountIDR, exchangeRate, onConfirm, pending }: PanelProps) {
  const t = useTranslations("pos");
  const [tendered, setTendered] = useState("");
  const amount = Number(amountIDR) || 0;
  const tender = Number(tendered) || 0;
  const change = tender > 0 ? tender - amount : 0;
  const short = tender > 0 && tender < amount;

  // Quick-tender chips: the exact amount and the next round notes above it.
  const round = (to: number) => Math.ceil(amount / to) * to;
  const chips = Array.from(new Set([amount, round(50000), round(100000)])).filter((v) => v >= amount && v > 0);

  return (
    <div className="mx-auto grid max-w-md gap-4">
      <div className="grid grid-cols-3 gap-2">
        {chips.map((v) => (
          <Button key={v} type="button" variant="outline" onClick={() => setTendered(String(v))}>
            {v === amount ? t("exactAmount") : `Rp ${v.toLocaleString("id-ID")}`}
          </Button>
        ))}
      </div>

      <div className="rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">{t("tendered")}</Label>
          <span className="text-lg font-semibold">Rp {(Number(tendered) || 0).toLocaleString("id-ID")}</span>
        </div>
      </div>
      <NumpadInput value={tendered} onChange={setTendered} />

      <div
        className={cn(
          "flex items-center justify-between rounded-lg p-3",
          short ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        )}
      >
        <span className="text-sm font-medium">{short ? t("stillOwed") : t("changeDue")}</span>
        <span className="text-xl font-bold">
          Rp {Math.abs(change).toLocaleString("id-ID")}
        </span>
      </div>

      <Button
        size="lg"
        className="h-14 text-base"
        // Block confirming an underpaid cash sale (tender entered but short).
        // Confirming with no tender is allowed — staff may not track exact cash.
        disabled={pending || short}
        onClick={() =>
          onConfirm({
            method: "CASH",
            tendered: tender > 0 ? String(Math.round(tender)) : undefined,
            changeDue: change > 0 ? String(Math.round(change)) : undefined,
          })
        }
      >
        {pending ? t("saving") : t("confirmPayment")}
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">
        <MoneyDualClient value={amountIDR} exchangeRate={exchangeRate} align="start" className="inline-flex" />
      </p>
    </div>
  );
}

/** Record a payment taken by another method (+ optional reference). */
function RecordBody({
  method,
  amountIDR,
  onConfirm,
  pending,
  banner,
}: PanelProps & { method: PaymentResult["method"]; banner?: string }) {
  const t = useTranslations("pos");
  const [reference, setReference] = useState("");
  return (
    <div className="mx-auto grid max-w-md gap-4">
      {banner ? (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{banner}</span>
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label className="text-xs">
          {t("reference")} <span className="text-muted-foreground">{t("optional")}</span>
        </Label>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t("referencePlaceholder")} />
      </div>
      <Button
        size="lg"
        className="h-14 text-base"
        disabled={pending}
        onClick={() => onConfirm({ method, reference: reference.trim() || undefined })}
      >
        {pending ? t("saving") : t("recordPayment")}
      </Button>
    </div>
  );
}

// Phase 2/3 seam: these already receive `amountIDR` + `onConfirm`. When a live
// gateway is wired up, swap the record body for a generated QR / hosted checkout
// that resolves `onConfirm` from a webhook confirmation.
function QrisPanel(props: PanelProps) {
  const t = useTranslations("pos");
  return <RecordBody {...props} method="QRIS" banner={t("liveComingSoon")} />;
}
function CardPanel(props: PanelProps) {
  const t = useTranslations("pos");
  return <RecordBody {...props} method="CARD" banner={t("liveComingSoon")} />;
}
function TransferPanel(props: PanelProps) {
  return <RecordBody {...props} method="TRANSFER" />;
}
