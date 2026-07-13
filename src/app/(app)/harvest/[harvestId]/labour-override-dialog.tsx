"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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
import { setHarvestLabourOverride } from "@/app/(app)/harvest/actions";

/**
 * Manually override this harvest's labour cost. When set, the typed figure
 * REPLACES the computed hours×rate labour in the P&L — for when reality differs
 * from the logged hours. Clearing it reverts to the computed figure.
 */
export function LabourOverrideDialog({
  harvestId,
  current,
  computed,
  note,
}: {
  harvestId: string;
  current: string | null;
  computed: string;
  note: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState(current ?? "");
  const [noteText, setNoteText] = useState(note ?? "");

  const fmt = (v: string) => "Rp " + Math.round(Number(v || 0)).toLocaleString("id-ID");

  function save(clear = false) {
    start(async () => {
      const r = await setHarvestLabourOverride({
        harvestId,
        amount: clear ? null : amount,
        note: clear ? null : noteText,
      });
      if (r.ok) {
        toast.success(clear ? "Override cleared — back to calculated labour" : "Labour cost overridden");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-3.5 w-3.5" /> {current ? "Edit override" : "Override labour"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual labour cost</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Type what you actually paid in labour for this cycle. It replaces the
            calculated figure (from logged hours) in the P&amp;L — handy when things
            don&apos;t go to plan. Leave blank to go back to calculated.
          </p>
          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
            Calculated from hours: <strong>{fmt(computed)}</strong>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ovr">Manual labour cost (Rp)</Label>
            <Input
              id="ovr"
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={String(Math.round(Number(computed || 0)))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ovrn">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="ovrn"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="e.g. extra help during harvest week"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {current ? (
            <Button variant="ghost" onClick={() => save(true)} disabled={pending}>
              Clear override
            </Button>
          ) : null}
          <Button onClick={() => save(false)} disabled={pending || amount.trim() === ""}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
