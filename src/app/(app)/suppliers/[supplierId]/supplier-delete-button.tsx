"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteSupplier } from "@/app/(app)/suppliers/actions";

export function SupplierDeleteButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>Delete</Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${name}?`}
        description="This removes the supplier. Purchase history stays but loses the supplier link."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() =>
          startTransition(async () => {
            const r = await deleteSupplier(id);
            if (r.ok) {
              toast.success("Supplier deleted");
              router.replace("/suppliers");
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
