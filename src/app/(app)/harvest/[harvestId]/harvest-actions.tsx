"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteHarvest } from "@/app/(app)/harvest/actions";

export function DeleteHarvestButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [, startT] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>Delete</Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${name}?`}
        description="Removes the harvest and all its sales, usage and assets. This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() =>
          startT(async () => {
            const r = await deleteHarvest(id);
            if (r.ok) {
              toast.success("Deleted");
              router.replace("/harvest");
              router.refresh();
            } else toast.error(r.error);
          })
        }
      />
    </>
  );
}
