"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { AddStaffDialog } from "@/app/(app)/staff/add-staff-dialog";
import { deleteStaff } from "@/app/(app)/staff/actions";

export function StaffCardActions({
  staff,
}: {
  staff: { id: string; name: string; role: string | null; avatar: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [, startT] = useTransition();
  const router = useRouter();
  return (
    <div className="flex gap-1">
      <AddStaffDialog
        existing={staff}
        trigger={<Button size="sm" variant="ghost"><Pencil className="h-3 w-3" /> Edit</Button>}
      />
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Trash2 className="h-3 w-3" /> Delete</Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${staff.name}?`}
        description="Cannot be undone if they have wage entries."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() =>
          startT(async () => {
            const r = await deleteStaff(staff.id);
            if (r.ok) { toast.success("Deleted"); router.refresh(); }
            else toast.error(r.error);
          })
        }
      />
    </div>
  );
}
