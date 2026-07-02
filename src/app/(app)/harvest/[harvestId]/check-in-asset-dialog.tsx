"use client";

import { useState, useTransition } from "react";
import { todayWIB } from "@/lib/date";
import { useRouter } from "next/navigation";
import { CheckCircle2, PackageX, ShieldOff } from "lucide-react";
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

type Condition = "good" | "damaged" | "lost";

const todayStr = () => todayWIB();

/**
 * Per-asset check-in dialog. Staff record HOW MUCH was actually used — in the
 * item's real unit (metres / pcs / grams / kg) — and that quantity is charged
 * to the greenhouse. Condition (good / damaged / lost) tags the line for the
 * audit log.
 *
 * Lightweight build (Boyd's "option 3"): the used quantity is charged; leftover
 * is NOT returned to inventory yet. A proper partial-return version comes later.
 */
export function CheckInAssetDialog({
  harvestAssetId,
  itemName,
  qty,
  unit,
  subUnit,
  subFactor,
  usesRemaining,
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
  trigger: React.ReactNode;
}) {
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
    if (!usedValid) {
      toast.error(`Enter how many ${unitLabel} were used.`);
      return;
    }
    // Convert the real-unit figure back to pack units for the ledger.
    const usedPacks = isPack ? usedNum / (subFactor as number) : usedNum;
    startT(async () => {
      const r = await checkInHarvestAsset({
        harvestAssetId,
        condition,
        usedQty: String(usedPacks),
        usedDisplay: `${usedNum} ${unitLabel}`,
        date,
        note,
      });
      if (r.ok) {
        toast.success(
          condition === "good"
            ? `Checked in — ${usedNum} ${unitLabel} used`
            : `Marked as ${condition} — ${usedNum} ${unitLabel} used`,
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
          <DialogTitle>Check in: {itemName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4 text-sm">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Took out{" "}
            <strong className="text-foreground">
              {installedInUnits} {unitLabel}
            </strong>
            {usesRemaining !== null
              ? ` · ${usesRemaining} use${usesRemaining === 1 ? "" : "s"} remaining per unit`
              : ""}
          </div>

          <div className="space-y-2">
            <Label>
              How many {unitLabel} were used?{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (took out {installedInUnits})
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
                placeholder={`0 to ${installedInUnits}`}
              />
              <span className="whitespace-nowrap text-sm text-muted-foreground">
                {unitLabel}
              </span>
            </div>
            {overInstalled ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                More than you took out — allowed, but double-check.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Only this much is charged to the greenhouse. Leftover isn&apos;t
                returned to stock yet (coming later).
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Condition</Label>
            <div className="grid grid-cols-3 gap-2">
              <ConditionOption
                value="good"
                current={condition}
                onSelect={setCondition}
                icon={<CheckCircle2 className="h-4 w-4" />}
                title="Good"
                subtitle="Used as normal"
                tint="emerald"
              />
              <ConditionOption
                value="damaged"
                current={condition}
                onSelect={setCondition}
                icon={<ShieldOff className="h-4 w-4" />}
                title="Damaged"
                subtitle="Note it for the log"
                tint="amber"
              />
              <ConditionOption
                value="lost"
                current={condition}
                onSelect={setCondition}
                icon={<PackageX className="h-4 w-4" />}
                title="Lost"
                subtitle="Note it for the log"
                tint="rose"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Return date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Note {condition !== "good" ? "(why)" : "(optional)"}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                condition === "damaged"
                  ? "e.g. cracked during install, motor burnt out…"
                  : condition === "lost"
                    ? "e.g. couldn't locate at greenhouse cleanup…"
                    : "Optional note for the audit log"
              }
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending || !usedValid}>
            {pending ? "Saving…" : "Check in"}
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
  tint: "emerald" | "amber" | "rose";
}) {
  const active = current === value;
  const tints: Record<string, string> = {
    emerald: "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    amber: "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    rose: "border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
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
