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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setStaffPay } from "@/app/(app)/staff/actions";

/**
 * Quick in-place pay correction — edits the current rate, no pay-rise history.
 * (Use "Add pay rise" for a tracked change effective from a date.)
 */
export function EditPayButton({
  staffId,
  currentRate,
}: {
  staffId: string;
  /** Current numeric rate as a string, or "" if none set. */
  currentRate: string;
}) {
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(currentRate);
  const [pending, startT] = useTransition();
  const router = useRouter();

  function submit() {
    startT(async () => {
      const r = await setStaffPay(staffId, { rate });
      if (r.ok) {
        toast.success("Pay updated");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="w-full"
        onClick={() => {
          setRate(currentRate);
          setOpen(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" /> Edit pay
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit pay</DialogTitle></DialogHeader>
          <div className="space-y-2 py-4">
            <Label>Hourly rate (IDR/hr)</Label>
            <Input
              type="number"
              step="any"
              min="0"
              autoFocus
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Corrects the current rate in place — no pay-rise record. Use{" "}
              <strong>Add pay rise</strong> for a tracked change.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="button" onClick={submit} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
