"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteItem } from "@/app/(app)/inventory/actions";

export function DeleteItemButton({ id, name }: { id: string; name: string }) {
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
        description="Deletes the item and all its batches/consumption history. Can't be undone via the UI."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() =>
          startT(async () => {
            const r = await deleteItem(id);
            if (r.ok) {
              toast.success("Deleted");
              router.replace("/inventory");
              router.refresh();
            } else {
              toast.error("error" in r ? r.error : "Failed");
            }
          })
        }
      />
    </>
  );
}
