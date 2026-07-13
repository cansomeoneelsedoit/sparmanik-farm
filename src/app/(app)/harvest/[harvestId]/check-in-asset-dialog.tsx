"use client";

import { useState, useTransition } from "react";
import { todayWIB } from "@/lib/date";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Home, PackageX, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
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
import { Textarea } from "@/components/ui/textarea";
import { checkInHarvestAsset } from "@/app/(app)/harvest/actions";

type Condition = "good" | "damaged" | "lost" | "used";

const todayStr = () => todayWIB();

/**
 * Per-asset RETURN dialog ("check in" read wrong — staff are giving the item
 * back). Staff record HOW MUCH was actually used — in the item's real unit
 * (metres / pcs / grams / kg) — and that quantity is charged to the greenhouse;
 * the unused remainder goes back to stock.
 *
 * Condition:
 *   good    → remainder returns to stock, used part is charged
 *   damaged / lost → nothing returns; tagged for the write-off report
 *   used    → consumed in place (foam glued to the tank, weedmat pinned): the
 *             WHOLE taken-out amount stays in the greenhouse — charged once,
 *             nothing back to stock, nothing written off. The used-qty input is
 *             hidden because the answer is "all of it".
 */
export function CheckInAssetDialog({
  harvestAssetId,
  itemName,
  qty,
  unit,
  subUnit,
  subFactor,
  usesRemaining,
  isCalendar = false,
  trigger,
}: {
  harvestAssetId: string;
  itemName: string;
  /** Installed quantity in PACK units. */
  qty: number;
  unit: string;
  /** Pack sub-unit ("metres" / "pcs" / "grams") — drives the used-qty input. */
  subUnit?: string | null;
  subFactor?: number | null;
  /** maxUses - useCount on the source batch (per unit), for the residual-value preview. */
  usesRemaining: number | null;
  /** CALENDAR equipment (meters, pumps) comes back whole — the "how much was
   *  used" question doesn't apply, and the server must take the
   *  return-to-stock path so the asset's schedule survives to the next cycle. */
  isCalendar?: boolean;
  trigger: React.ReactNode;
}) {
  const t = useTranslations("checkinDialog");
  const tCommon = useTranslations("common");
  const isPack = !!(subUnit && subFactor && subFactor > 0);
  const unitLabel = isPack ? (subUnit as string) : unit;
  // Installed amount expressed in the real unit staff think in.
  const installedInUnits = isPack ? qty * (subFactor as number) : qty;

  const [open, setOpen] = useState(false);
  const [condition, setCondition] = useState<Condition>("good");
  const [used, setUsed] = useState(String(installedInUnits));
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [pending, startT] = useTransition();
  const router = useRouter();

  const usedNum = /^[0-9.]+$/.test(used) ? Number(used) : NaN;
  const usedValid = !Number.isNaN(usedNum) && usedNum >= 0;
  const overInstalled = usedValid && usedNum > installedInUnits + 1e-9;

  function reset() {
    setUsed(String(installedInUnits));
    setNote("");
    setCondition("good");
    setDate(todayStr());
  }

  function submit() {
    // "Used up" always consumes the full taken-out amount — no qty to validate.
    const isUsedUp = condition === "used";
    // CALENDAR equipment (not consumed in place) returns whole: omit usedQty so
    // the server takes the return-to-stock path and the schedule carries over.
    const wholeReturn = isCalendar && !isUsedUp;
    if (!isUsedUp && !wholeReturn && !usedValid) {
      toast.error(t("enterUsed", { unit: unitLabel }));
      return;
    }
    const effectiveUsed = isUsedUp || wholeReturn ? installedInUnits : usedNum;
    // Convert the real-unit figure back to pack units for the ledger.
    const usedPacks = isPack ? effectiveUsed / (subFactor as number) : effectiveUsed;
    startT(async () => {
      const r = await checkInHarvestAsset({
        harvestAssetId,
        condition,
        ...(wholeReturn
          ? {}
          : { usedQty: String(usedPacks), usedDisplay: `${effectiveUsed} ${unitLabel}` }),
        date,
        note,
      });
      if (r.ok) {
        toast.success(
          condition === "good"
            ? t("toastGood", { qty: effectiveUsed, unit: unitLabel })
            : condition === "damaged"
              ? t("toastDamaged", { qty: effectiveUsed, unit: unitLabel })
              : condition === "lost"
                ? t("toastLost", { qty: effectiveUsed, unit: unitLabel })
                : t("toastUsed", { qty: effectiveUsed, unit: unitLabel }),
        );
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { name: itemName })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4 text-sm">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {t("tookOut")}{" "}
            <strong className="text-foreground">
              {installedInUnits} {unitLabel}
            </strong>
            {usesRemaining !== null ? <> {t("usesRemaining", { n: usesRemaining })}</> : null}
          </div>

          <div className="space-y-2">
            <Label>{t("condition")}</Label>
            <div className="grid grid-cols-2 gap-2">
              <ConditionOption
                value="good"
                current={condition}
                onSelect={setCondition}
                icon={<CheckCircle2 className="h-4 w-4" />}
                title={t("good")}
                subtitle={t("goodSub")}
                tint="emerald"
              />
              <ConditionOption
                value="used"
                current={condition}
                onSelect={setCondition}
                icon={<Home className="h-4 w-4" />}
                title={t("used")}
                subtitle={t("usedSub")}
                tint="sky"
              />
              <ConditionOption
                value="damaged"
                current={condition}
                onSelect={setCondition}
                icon={<ShieldOff className="h-4 w-4" />}
                title={t("damaged")}
                subtitle={t("damagedSub")}
                tint="amber"
              />
              <ConditionOption
                value="lost"
                current={condition}
                onSelect={setCondition}
                icon={<PackageX className="h-4 w-4" />}
                title={t("lost")}
                subtitle={t("lostSub")}
                tint="rose"
              />
            </div>
          </div>

          {condition === "used" ? (
            /* Consumed in place — the whole amount stays in the greenhouse, so
               there's no "how much was used" question to answer. */
            <div className="rounded-md border bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
              {t("usedNote", { qty: installedInUnits, unit: unitLabel })}
            </div>
          ) : isCalendar ? (
            /* Time-depreciated equipment returns whole — no used-qty question. */
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {t("tookOut")}{" "}
              <strong className="text-foreground">
                {installedInUnits} {unitLabel}
              </strong>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>
                {t("howManyUsed", { unit: unitLabel })}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  {t("tookOutHint", { qty: installedInUnits })}
                </span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  autoFocus
                  value={used}
                  onChange={(e) => setUsed(e.target.value)}
                  placeholder={t("usedPlaceholder", { max: installedInUnits })}
                />
                <span className="whitespace-nowrap text-sm text-muted-foreground">
                  {unitLabel}
                </span>
              </div>
              {overInstalled ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t("overWarning")}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {t("chargeHint")}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("returnDate")}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{condition === "damaged" || condition === "lost" ? t("noteWhy") : t("noteOptional")}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                condition === "damaged"
                  ? t("placeholderDamaged")
                  : condition === "lost"
                    ? t("placeholderLost")
                    : condition === "used"
                      ? t("placeholderUsed")
                      : t("placeholderGood")
              }
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {tCommon("cancel")}
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={pending || (condition !== "used" && !isCalendar && !usedValid)}
          >
            {pending ? t("saving") : t("checkIn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConditionOption({
  value,
  current,
  onSelect,
  icon,
  title,
  subtitle,
  tint,
}: {
  value: Condition;
  current: Condition;
  onSelect: (v: Condition) => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tint: "emerald" | "amber" | "rose" | "sky";
}) {
  const active = current === value;
  const tints: Record<string, string> = {
    emerald: "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    amber: "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    rose: "border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    sky: "border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  };
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        "flex flex-col items-start gap-1 rounded-md border p-2.5 text-left transition-colors",
        active ? tints[tint] : "border-input bg-background hover:bg-muted/40",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {title}
      </div>
      <div className="text-[10px] leading-tight text-muted-foreground">{subtitle}</div>
    </button>
  );
}
