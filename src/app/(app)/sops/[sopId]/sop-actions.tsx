"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteSop, setSopStatus } from "@/app/(app)/sops/actions";

export function SopActions({ id, status }: { id: string; status: "ACTIVE" | "ARCHIVED" }) {
  const [confirm, setConfirm] = useState(false);
  const [, startT] = useTransition();
  const router = useRouter();

  return (
    <>
      <Button
        variant="outline"
        onClick={() =>
          startT(async () => {
            const next = status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
            const r = await setSopStatus(id, next);
            if (r.ok) router.refresh();
            else toast.error(r.error);
          })
        }
      >
        {status === "ACTIVE" ? "Archive" : "Unarchive"}
      </Button>
      <Button variant="destructive" onClick={() => setConfirm(true)}>Delete</Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete SOP?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() =>
          startT(async () => {
            const r = await deleteSop(id);
            if (r.ok) {
              toast.success("Deleted");
              router.replace("/sops");
              router.refresh();
            } else toast.error(r.error);
          })
        }
      />
    </>
  );
}
