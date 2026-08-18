"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { setHarvestProduceHarvested } from "@/app/(app)/harvest/[harvestId]/harvested-actions";
import { logSale } from "@/app/(app)/harvest/actions";
import { todayWIB } from "@/lib/date";

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Set how much of a produce is still UNSOLD on hand for this cycle. Boyd enters
 * the leftover; we derive the total picked (harvestedKg = sold + given + unsold)
 * server-side. Total produced updates live so he can sanity-check before saving.
 */
export function SetHarvestedDialog({
  harvestId,
  produceId,
  produceName,
  soldKg,
  disposedKg,
  currentUnsold,
  currentEstPrice,
  suggestedPrice,
}: {
  harvestId: string;
  produceId: string;
  produceName: string;
  soldKg: number;
  disposedKg: number;
  currentUnsold: number | null;
  /** Estimated price/kg already saved for the leftover, if any. */
  currentEstPrice?: number | null;
  /** Recent avg sale price/kg for this produce — prefilled as a sensible default. */
  suggestedPrice?: number | null;
}) {
  const isSet = currentUnsold != null;
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const [unsold, setUnsold] = useState<string>(currentUnsold != null ? String(currentUnsold) : "");
  const [estPrice, setEstPrice] = useState<string>(
    currentEstPrice != null ? String(currentEstPrice) : suggestedPrice ? String(Math.round(suggestedPrice)) : "",
  );
  const router = useRouter();

  // Quick "sold X kg at Y" straight out of the unsold pool. Logs a real
  // Sale (fromUnsold=true) so the leftover shrinks by itself and the crop
  // flips to Sold out at 0 — no need to re-type the remaining figure.
  const [sellKg, setSellKg] = useState<string>("");
  const [sellPrice, setSellPrice] = useState<string>("");
  const remaining = currentUnsold ?? 0;
  const sellKgNum = Number(sellKg) || 0;
  const sellPriceNum = Number(sellPrice) || 0;
  const sellTotal = Math.round(sellKgNum * sellPriceNum);
  const afterSale = round3(Math.max(0, remaining - sellKgNum));

  function sellFromUnsold() {
    if (sellKgNum <= 0 || sellPriceNum <= 0) return;
    if (sellKgNum > remaining + 0.0005) {
      toast.error(`Only ${round3(remaining)} kg left unsold`);
      return;
    }
    startT(async () => {
      const r = await logSale({
        harvestId,
        produceId,
        date: todayWIB(),
        grade: "A",
        weight: String(sellKgNum),
        pricePerKg: String(sellPriceNum),
        fromUnsold: true,
      });
      if (r.ok) {
        toast.success(
          afterSale === 0
            ? `Sold ${round3(sellKgNum)} kg — all gone, marked Sold out`
            : `Sold ${round3(sellKgNum)} kg · ${afterSale} kg still unsold`,
        );
        setSellKg("");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function reset() {
    setSellKg("");
    setSellPrice("");
    setUnsold(currentUnsold != null ? String(currentUnsold) : "");
    setEstPrice(
      currentEstPrice != null ? String(currentEstPrice) : suggestedPrice ? String(Math.round(suggestedPrice)) : "",
    );
  }

  const unsoldNum = Number(unsold) || 0;
  const producedPreview = round3(soldKg + disposedKg + unsoldNum);
  const estValue = Math.round(unsoldNum * (Number(estPrice) || 0));

  function save(clear: boolean) {
    startT(async () => {
      const r = await setHarvestProduceHarvested({
        harvestId,
        produceId,
        unsoldKg: clear ? "" : unsold,
        estPricePerKg: clear ? "" : estPrice,
      });
      if (r.ok) {
        toast.success(clear ? "Cleared" : "Saved unsold on hand");
        setOpen(false);
        if (clear) setUnsold("");
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
        <Button variant="outline" size="sm">
          {isSet ? "Edit" : "Set unsold"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unsold on hand — {produceName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            <div>
              Sold so far: <strong className="text-foreground">{round3(soldKg)} kg</strong>
            </div>
            <div>
              Given / waste: <strong className="text-foreground">{round3(disposedKg)} kg</strong>
            </div>
          </div>

          {isSet && remaining > 0 ? (
            <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
              <div className="flex items-baseline justify-between gap-2">
                <Label className="font-semibold">Sold some of it?</Label>
                <span className="text-xs text-muted-foreground">
                  {round3(remaining)} kg unsold
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Sold (kg)</Label>
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      max={remaining}
                      value={sellKg}
                      onChange={(e) => setSellKg(e.target.value)}
                      placeholder={String(round3(remaining))}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 shrink-0 px-2 text-xs"
                      onClick={() => setSellKg(String(round3(remaining)))}
                    >
                      All
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Price / kg (Rp)</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                    placeholder={estPrice || "e.g. 20000"}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  {sellKgNum > 0 && sellPriceNum > 0 ? (
                    <>
                      = <strong className="text-foreground">Rp {sellTotal.toLocaleString("id-ID")}</strong>
                      {" · "}
                      {afterSale === 0 ? (
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">
                          all gone → Sold out
                        </span>
                      ) : (
                        <>{afterSale} kg left after</>
                      )}
                    </>
                  ) : (
                    "Logs a real sale today (grade A) and takes it off the unsold pile."
                  )}
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || sellKgNum <= 0 || sellPriceNum <= 0}
                  onClick={sellFromUnsold}
                >
                  {pending ? "Saving…" : "Log sale"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Still unsold on hand (kg)</Label>
            <Input
              type="number"
              step="any"
              min="0"
              value={unsold}
              onChange={(e) => setUnsold(e.target.value)}
              placeholder="e.g. 12.5"
            />
            <p className="text-xs text-muted-foreground">
              Enter <strong>0</strong> when everything&apos;s gone — the crop is marked{" "}
              <span className="font-medium text-emerald-700 dark:text-emerald-400">Sold out</span>.
            </p>
          </div>

          <div className="space-y-2">
            <Label>
              Estimated price / kg for the leftover{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              type="number"
              step="any"
              min="0"
              value={estPrice}
              onChange={(e) => setEstPrice(e.target.value)}
              placeholder={suggestedPrice ? String(Math.round(suggestedPrice)) : "e.g. 50000"}
            />
            <p className="text-xs text-muted-foreground">
              An estimate of what you&apos;ll sell it for — real income only lands when you actually sell it.
            </p>
          </div>

          <div className="rounded-md bg-muted/30 px-3 py-2 text-sm">
            <div>
              Total produced will be:{" "}
              <strong className="text-foreground">{producedPreview} kg</strong>
            </div>
            {unsoldNum > 0 && Number(estPrice) > 0 ? (
              <div className="mt-0.5 text-emerald-700 dark:text-emerald-400">
                Est. value of leftover:{" "}
                <strong>Rp {estValue.toLocaleString("id-ID")}</strong> ({round3(unsoldNum)} kg × Rp{" "}
                {Math.round(Number(estPrice)).toLocaleString("id-ID")})
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          {isSet ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => save(true)}
              disabled={pending}
            >
              Clear
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => save(false)} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
