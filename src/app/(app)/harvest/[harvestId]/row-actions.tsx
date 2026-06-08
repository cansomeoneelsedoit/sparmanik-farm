"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  deleteSale,
  deleteHarvestUsage,
  deleteHarvestAsset,
  deleteLabourLine,
} from "@/app/(app)/harvest/actions";

export function DeleteSaleButton({ id }: { id: string }) {
  return <DeleteIcon id={id} action={deleteSale} label="Delete sale" />;
}

export function DeleteUsageButton({ id }: { id: string }) {
  return <DeleteIcon id={id} action={deleteHarvestUsage} label="Delete usage" />;
}

export function DeleteAssetButton({ id }: { id: string }) {
  return <DeleteIcon id={id} action={deleteHarvestAsset} label="Delete asset" />;
}

/**
 * Delete-labour gets a confirmation prompt (the others delete on click).
 * Wage entries also feed payroll/financials so deletion has more downstream
 * impact than e.g. a sale; we ask first.
 */
export function DeleteLabourButton({
  id,
  summary,
}: {
  id: string;
  /** One-line "Erni Damanik — 3h on 2026-04-07 (Pruning melon vines)"
   *  surfaced in the confirm prompt so the user can sanity-check which
   *  row they're about to remove. */
  summary: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        title="Delete labour line"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this labour line?"
        description={`${summary}\n\nThis can't be undone. The cost of this line will be removed from the harvest P&L and from Financials.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={async () => {
          const r = await deleteLabourLine(id);
          if (r.ok) {
            toast.success("Labour line deleted");
            router.refresh();
          } else {
            toast.error(r.error);
          }
        }}
      />
    </>
  );
}

function DeleteIcon({ id, action, label }: { id: string; action: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>; label: string }) {
  const [pending, startT] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="icon"
      variant="ghost"
      disabled={pending}
      title={label}
      onClick={() =>
        startT(async () => {
          const r = await action(id);
          if (r.ok) { toast.success("Deleted"); router.refresh(); }
          else toast.error(r.error);
        })
      }
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
