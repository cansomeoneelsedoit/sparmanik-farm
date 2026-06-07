"use client";

import { useState, useTransition } from "react";
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

const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * Per-asset check-in dialog. Lets staff release a reusable asset back to
 * inventory mid-harvest, or flag it as damaged/lost so the business absorbs
 * the loss instead of the harvest's P&L.
 */
export function CheckInAssetDialog({
  harvestAssetId,
  itemName,
  qty,
  unit,
  usesRemaining,
  trigger,
}: {
  harvestAssetId: string;
  itemName: string;
  qty: number;
  unit: string;
  /** maxUses - useCount on the source batch (per unit), for the residual-value preview. */
  usesRemaining: number | null;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [condition, setCondition] = useState<Condition>("good");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [pending, startT] = useTransition();
  const router = useRouter();

  function submit() {
    startT(async () => {
      const r = await checkInHarvestAsset({
        harvestAssetId,
        condition,
        date,
        note,
      });
      if (r.ok) {
        toast.success(
          condition === "good"
            ? "Checked in — returned to inventory"
            : `Marked as ${condition} — business write-off`,
        );
        setOpen(false);
        setNote("");
        setCondition("good");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Check in: {itemName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4 text-sm">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {qty} {unit}
            {usesRemaining !== null
              ? ` · ${usesRemaining} use${usesRemaining === 1 ? "" : "s"} remaining per unit`
              : ""}
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
                subtitle="Returns to inventory; uses preserved"
                tint="emerald"
              />
              <ConditionOption
                value="damaged"
                current={condition}
                onSelect={setCondition}
                icon={<ShieldOff className="h-4 w-4" />}
                title="Damaged"
                subtitle="Business absorbs the loss"
                tint="amber"
              />
              <ConditionOption
                value="lost"
                current={condition}
                onSelect={setCondition}
                icon={<PackageX className="h-4 w-4" />}
                title="Lost"
                subtitle="Business absorbs the loss"
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

          {condition !== "good" ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              The residual depreciable value stays with the business, not this
              harvest&apos;s P&amp;L. It will appear on the Financials &ldquo;Damage
              losses&rdquo; line, linked back to this harvest.
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
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
