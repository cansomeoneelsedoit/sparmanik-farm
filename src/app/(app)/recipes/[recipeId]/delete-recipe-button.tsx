"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteRecipe } from "@/app/(app)/recipes/actions";

export function DeleteRecipeButton({ id, name }: { id: string; name: string }) {
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
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() =>
          startT(async () => {
            const r = await deleteRecipe(id);
            if (r.ok) {
              toast.success("Deleted");
              router.replace("/recipes");
              router.refresh();
            } else toast.error(r.error);
          })
        }
      />
    </>
  );
}
