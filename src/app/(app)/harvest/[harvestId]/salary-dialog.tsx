"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeDollarSign, Trash2 } from "lucide-react";

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
import { Combobox } from "@/components/ui/combobox";
import { addHarvestSalary, removeHarvestSalary } from "@/app/(app)/harvest/actions";

/** Assign a fixed monthly salary to this cycle — it accrues automatically each day. */
export function AddSalaryDialog({
  harvestId,
  staff,
  defaultStart,
}: {
  harvestId: string;
  staff: { id: string; name: string }[];
  defaultStart: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [monthly, setMonthly] = useState("3000000");
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");

  const perDay = Number(monthly) > 0 ? Math.round(Number(monthly) / 30.4375) : 0;

  function save() {
    if (!staffId) {
      toast.error("Pick a staff member");
      return;
    }
    start(async () => {
      const r = await addHarvestSalary({
        harvestId,
        staffId,
        monthlyAmount: monthly,
        startDate,
        endDate: endDate || undefined,
        note,
      });
      if (r.ok) {
        toast.success("Fixed salary added — it accrues daily from now on");
        setOpen(false);
        setStaffId(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BadgeDollarSign className="h-3.5 w-3.5" /> Add fixed salary
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fixed monthly salary on this cycle</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            For staff paid a flat monthly wage rather than by the hour. The cost is spread evenly
            over the days of each month and added to this cycle&apos;s labour automatically — no
            hours to log.
          </p>
          <div className="space-y-1">
            <Label>Staff</Label>
            <Combobox
              value={staffId}
              onChange={setStaffId}
              placeholder="Pick staff"
              options={staff.map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <div className="space-y-1">
              <Label>Monthly salary (Rp)</Label>
              <Input type="number" min="0" step="any" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
              {perDay ? (
                <p className="text-[11px] text-muted-foreground">≈ Rp {perDay.toLocaleString("id-ID")} / day</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>From</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <div className="space-y-1">
              <Label>
                Until <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Blank = until the cycle ends.</p>
            </div>
            <div className="space-y-1">
              <Label>
                Note <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. field lead" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !staffId || !(Number(monthly) > 0)}>
            {pending ? "Saving…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveSalaryButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title="Remove"
      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
      onClick={() => {
        if (!window.confirm(`Remove the fixed salary for ${name} from this cycle?`)) return;
        start(async () => {
          const r = await removeHarvestSalary(id);
          if (r.ok) router.refresh();
          else toast.error(r.error);
        });
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
