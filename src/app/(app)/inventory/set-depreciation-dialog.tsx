"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CircleSlash, Recycle, Wrench } from "lucide-react";
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
import { setItemDepreciation } from "@/app/(app)/inventory/depreciation-actions";

type Mode = "NONE" | "PER_USE" | "CALENDAR";

/**
 * Superuser dialog to set an item's depreciation policy. Choosing a mode and
 * saving calls setItemDepreciation, which re-spreads every existing harvest
 * charge for the item from its full cost (the P&L corrects itself). Reachable
 * from the item detail page and straight off a harvest's asset rows.
 */
export function SetDepreciationDialog({
  itemId,
  itemName,
  current,
  trigger,
}: {
  itemId: string;
  itemName: string;
  /** The item's current policy, used to prefill the form. */
  current: { mode: Mode; uses?: number | null; months?: number | null };
  /** Custom trigger. Defaults to a "Set depreciation" button. */
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(current.mode ?? "NONE");
  // Keep the two number fields independent so switching modes back and forth
  // doesn't lose what the user typed. Seed with the item's current values, or a
  // sensible example (twine 4 uses / a 2-year meter) when it has none yet.
  const [uses, setUses] = useState(current.uses != null ? String(current.uses) : "4");
  const [months, setMonths] = useState(current.months != null ? String(current.months) : "24");
  const [pending, startT] = useTransition();
  const router = useRouter();

  function reset() {
    setMode(current.mode ?? "NONE");
    setUses(current.uses != null ? String(current.uses) : "4");
    setMonths(current.months != null ? String(current.months) : "24");
  }

  function submit() {
    if (mode === "PER_USE") {
      const n = Number(uses);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
        toast.error("Enter how many uses it lasts (a whole number ≥ 1)");
        return;
      }
    }
    if (mode === "CALENDAR") {
      const n = Number(months);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
        toast.error("Enter the useful life in months (a whole number ≥ 1)");
        return;
      }
    }
    startT(async () => {
      const r = await setItemDepreciation({
        itemId,
        mode,
        uses: mode === "PER_USE" ? Number(uses) : undefined,
        months: mode === "CALENDAR" ? Number(months) : undefined,
      });
      if (r.ok) {
        const n = r.data?.installsUpdated ?? 0;
        toast.success(`Updated — re-spread ${n} harvest charge${n === 1 ? "" : "s"}`);
        setOpen(false);
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
        {trigger ?? (
          <Button variant="outline" size="sm">
            Set depreciation
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Depreciation — {itemName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4 text-sm">
          <div className="space-y-2">
            <ModeOption
              value="NONE"
              current={mode}
              onSelect={setMode}
              icon={<CircleSlash className="h-4 w-4" />}
              title="No depreciation — charge full cost"
              subtitle="Each install charges the full purchase cost. Use for one-off consumables."
              tint="neutral"
            />
            <ModeOption
              value="PER_USE"
              current={mode}
              onSelect={setMode}
              icon={<Recycle className="h-4 w-4" />}
              title="Consumable — lasts a number of uses"
              subtitle="Reused a set number of times, then worn out. Each harvest is charged cost ÷ uses."
              tint="emerald"
            >
              {mode === "PER_USE" ? (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="depr-uses">How many uses / harvests?</Label>
                  <Input
                    id="depr-uses"
                    type="number"
                    step="1"
                    min="1"
                    value={uses}
                    onChange={(e) => setUses(e.target.value)}
                    autoFocus
                  />
                  <p className="text-[11px] text-muted-foreground">
                    e.g. twine you reuse 4 times → 4; each harvest is charged cost ÷ 4.
                  </p>
                </div>
              ) : null}
            </ModeOption>
            <ModeOption
              value="CALENDAR"
              current={mode}
              onSelect={setMode}
              icon={<Wrench className="h-4 w-4" />}
              title="Equipment — lasts a number of months"
              subtitle="Wears out over time. Each cycle is charged its own time-share of the cost."
              tint="sky"
            >
              {mode === "CALENDAR" ? (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="depr-months">Useful life in months</Label>
                  <Input
                    id="depr-months"
                    type="number"
                    step="1"
                    min="1"
                    value={months}
                    onChange={(e) => setMonths(e.target.value)}
                    autoFocus
                  />
                  <p className="text-[11px] text-muted-foreground">
                    e.g. a meter that lasts about 2 years → 24; each cycle is charged its time-share.
                  </p>
                </div>
              ) : null}
            </ModeOption>
          </div>

          <p className="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            Saving re-spreads every existing harvest charge for this item from its full cost, so
            past cycles&rsquo; P&amp;L corrects itself.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeOption({
  value,
  current,
  onSelect,
  icon,
  title,
  subtitle,
  tint,
  children,
}: {
  value: Mode;
  current: Mode;
  onSelect: (v: Mode) => void;
  icon: ReactNode;
  title: string;
  subtitle: string;
  tint: "neutral" | "emerald" | "sky";
  children?: ReactNode;
}) {
  const active = current === value;
  const tints: Record<string, string> = {
    neutral: "border-foreground/40 bg-muted/40 text-foreground",
    emerald: "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    sky: "border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  };
  return (
    <div
      className={cn(
        "rounded-md border transition-colors",
        active ? tints[tint] : "border-input bg-background",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(value)}
        className="flex w-full items-start gap-2.5 p-2.5 text-left"
      >
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border">
          {active ? <span className="h-2.5 w-2.5 rounded-full bg-current" /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {icon}
            {title}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{subtitle}</span>
        </span>
      </button>
      {children ? <div className="px-2.5 pb-2.5">{children}</div> : null}
    </div>
  );
}
