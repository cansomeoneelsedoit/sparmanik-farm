"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { endHarvest } from "@/app/(app)/harvest/actions";

export function EndHarvestButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [, startT] = useTransition();
  const router = useRouter();

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>End harvest</Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="End this harvest?"
        description="The harvest will be marked Closed. You can still view its data."
        confirmLabel="End harvest"
        cancelLabel="Cancel"
        onConfirm={() =>
          startT(async () => {
            const r = await endHarvest(id);
            if (r.ok) {
              toast.success("Harvest ended");
              router.refresh();
            } else {
              toast.error(r.error);
            }
          })
        }
      />
    </>
  );
}
