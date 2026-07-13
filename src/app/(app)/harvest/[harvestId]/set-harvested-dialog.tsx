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

  function reset() {
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
