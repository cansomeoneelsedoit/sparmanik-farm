"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Check, Combine, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SmartImage } from "@/components/shared/smart-image";
import { applyStocktake } from "@/app/(app)/inventory/actions";
import { MergeItemDialog } from "@/app/(app)/inventory/merge-item-dialog";

export type StocktakeItem = {
  id: string;
  code: string;
  name: string;
  unit: string;
  subUnit: string | null;
  subFactor: string | null;
  categoryId: string | null;
  /** True when the item still has no pack size set and isn't obvious
   *  equipment — the `?focus=packinfo` queue. */
  packCandidate: boolean;
  photoPath: string | null;
  /** Pre-formatted "current stock in packs" string from the server. */
  currentPacksStr: string;
  /** Pre-formatted "current stock in sub-units" string when subFactor is
   *  set, else mirrors currentPacksStr — display-only. */
  currentSubStr: string;
  /** True once a stock-take entry has been recorded for this item. The
   *  wizard renders these last so the user works through the un-fixed
   *  ones first. */
  done: boolean;
};

/**
 * One-line collapsible row in the stock-take wizard. Click the row to
 * expand it inline — no modal. Inside: pack-info toggle (Is this a pack?)
 * + an actual-quantity input. Save commits the change via applyStocktake().
 *
 * Designed for fast keyboard work: tab through the fields, hit Save, the
 * row collapses and the next one opens automatically.
 */
export function StocktakeRow({
  item,
  onSaved,
  autoOpenNextId,
}: {
  item: StocktakeItem;
  onSaved?: () => void;
  /** The id of the next stock-take row in the queue. When set, this row
   *  auto-opens its sibling and scrolls it into view after a successful
   *  Save & next — turning the warehouse walk into a Tab/Enter rhythm. */
  autoOpenNextId?: string | null;
}) {
  const t = useTranslations("stocktake");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();

  const initialIsPack = !!(item.subUnit && item.subFactor);
  const [isPack, setIsPack] = useState(initialIsPack);
  const [subUnit, setSubUnit] = useState(item.subUnit ?? "");
  const [subFactor, setSubFactor] = useState(item.subFactor ?? "");
  const [actualQty, setActualQty] = useState("");
  const [note, setNote] = useState("");

  // Live preview: what the user is about to record.
  const effFactor =
    isPack && subFactor && Number(subFactor) > 0 ? Number(subFactor) : null;
  const targetPacks = (() => {
    if (!actualQty || !/^[0-9.]+$/.test(actualQty)) return null;
    const n = Number(actualQty);
    return effFactor ? n / effFactor : n;
  })();
  const currentPacksNum = Number(item.currentPacksStr);
  const delta = targetPacks !== null ? targetPacks - currentPacksNum : null;

  function reset() {
    setIsPack(initialIsPack);
    setSubUnit(item.subUnit ?? "");
    setSubFactor(item.subFactor ?? "");
    setActualQty("");
    setNote("");
  }

  function save() {
    startT(async () => {
      const r = await applyStocktake({
        itemId: item.id,
        subUnit: isPack ? subUnit.trim() || null : null,
        subFactor:
          isPack && subFactor.trim() && Number(subFactor) > 0
            ? subFactor.trim()
            : null,
        actualQtyInSubUnit: actualQty.trim() || null,
        note: note.trim() || undefined,
      });
      if (r.ok) {
        toast.success(t("savedToast", { name: item.name }));
        setOpen(false);
        reset();
        onSaved?.();
        // Auto-open the next row in the queue and scroll it into view —
        // turns the walk into a Tab/Enter rhythm instead of a click-scroll-
        // click chore. The next row's id is rendered as a data-attribute on
        // its outer div + a button#expand inside; click both to open and
        // smooth-scroll.
        if (autoOpenNextId && typeof window !== "undefined") {
          // The router.refresh below re-renders the parent, which would
          // mount fresh row components. Defer a tick so the new DOM is in
          // place before we try to click into it.
          setTimeout(() => {
            const nextEl = document.querySelector(
              `[data-stocktake-row-id="${autoOpenNextId}"]`,
            );
            if (nextEl instanceof HTMLElement) {
              const expandBtn = nextEl.querySelector<HTMLButtonElement>(
                "button[data-stocktake-expand]",
              );
              expandBtn?.click();
              nextEl.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }, 100);
        }
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div
      data-stocktake-row-id={item.id}
      className={cn(
        "rounded-lg border bg-card transition-colors",
        item.done && !open && "opacity-60",
      )}
    >
      <button
        type="button"
        data-stocktake-expand
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 p-2.5 text-left hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <SmartImage
          src={item.photoPath ? `/api/items/${item.id}/photo` : null}
          alt={item.name}
          className="h-10 w-10 shrink-0 rounded-md border object-cover"
          fallbackClassName="border-dashed"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {item.name?.trim() || (
              <span className="italic text-muted-foreground">
                {t("untitledItem")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono tracking-wider">
              {item.code}
            </span>
            <span>
              {t("onHand")}{" "}
              <strong className="text-foreground">
                {item.currentPacksStr} {item.unit}
              </strong>
              {item.subUnit && item.subFactor ? (
                <>
                  {" "}({item.currentSubStr} {item.subUnit})
                </>
              ) : null}
            </span>
          </div>
        </div>
        {item.done ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
            <Check className="h-3 w-3" /> {t("countedBadge")}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="space-y-4 border-t bg-muted/20 p-4">
          {/* Step 1: pack info */}
          <div className="space-y-3 rounded-md border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <Label className="text-sm">{t("packToggle")}</Label>
                <p className="text-[11px] text-muted-foreground">
                  {t("packToggleHint")}
                </p>
              </div>
              <Switch
                checked={isPack}
                onCheckedChange={(v) => {
                  setIsPack(v);
                  if (!v) {
                    setSubUnit("");
                    setSubFactor("");
                  }
                }}
              />
            </div>
            {isPack ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("measuredIn")}</Label>
                  <Input
                    value={subUnit}
                    onChange={(e) => setSubUnit(e.target.value)}
                    placeholder={t("measuredInPlaceholder")}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("packSize", {
                      sub: subUnit || t("subUnitsFallback"),
                      unit: item.unit,
                    })}
                  </Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={subFactor}
                    onChange={(e) => setSubFactor(e.target.value)}
                    placeholder={t("packSizePlaceholder")}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* Step 2: actual stock */}
          <div className="space-y-3 rounded-md border bg-background p-3">
            <div className="space-y-0.5">
              <Label className="text-sm">{t("actualTitle")}</Label>
              <p className="text-[11px] text-muted-foreground">
                {t("actualHint")}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1">
                <Label className="text-xs">
                  {t("actualLabel", {
                    unit: isPack && subUnit ? subUnit : item.unit,
                  })}
                </Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={actualQty}
                  onChange={(e) => setActualQty(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("noteLabel")}</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("notePlaceholder")}
                />
              </div>
            </div>
            {targetPacks !== null && delta !== null ? (
              <div className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                {t("previewCurrent")} <strong>{currentPacksNum.toFixed(2)}</strong>{" "}
                {item.unit} → {t("previewWillSet")}{" "}
                <strong className="text-foreground">
                  {targetPacks.toFixed(2)} {item.unit}
                </strong>{" "}
                ({delta > 0 ? "+" : ""}
                <strong
                  className={cn(
                    delta > 0
                      ? "text-emerald-700 dark:text-emerald-300"
                      : delta < 0
                        ? "text-rose-700 dark:text-rose-300"
                        : "text-muted-foreground",
                  )}
                >
                  {delta.toFixed(2)}
                </strong>
                )
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2">
            <MergeItemDialog
              sourceId={item.id}
              sourceName={item.name}
              sourceCode={item.code}
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title={t("mergeTitle")}
                >
                  <Combine className="h-3.5 w-3.5" /> {t("mergeInto")}
                </Button>
              }
              onMerged={() => {
                // Row's underlying item just got deleted — collapse + signal
                // the parent so it can refresh or hide this row.
                setOpen(false);
                onSaved?.();
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={pending}
            >
              <X className="h-3.5 w-3.5" /> {tc("cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={pending || (!isPack && !actualQty.trim())}
            >
              <Check className="h-3.5 w-3.5" />
              {pending ? t("saving") : t("saveNext")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
