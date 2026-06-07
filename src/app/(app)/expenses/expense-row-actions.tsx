"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ExpenseFormDialog } from "@/app/(app)/expenses/expense-form-dialog";
import { deleteExpense } from "@/app/(app)/expenses/actions";

export function ExpenseRowActions({
  expense,
  harvests,
}: {
  expense: {
    id: string;
    date: string;
    amount: string;
    category: string | null;
    payee: string;
    description: string | null;
    harvestId: string | null;
    paymentMethod: string | null;
    receiptPath: string | null;
  };
  harvests: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [, startT] = useTransition();
  const router = useRouter();
  return (
    <div className="flex justify-end gap-1">
      <ExpenseFormDialog
        harvests={harvests}
        existing={expense}
        trigger={
          <Button size="icon" variant="ghost" title="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        }
      />
      <Button size="icon" variant="ghost" onClick={() => setOpen(true)} title="Delete">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this expense?"
        description="Cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() =>
          startT(async () => {
            const r = await deleteExpense(expense.id);
            if (r.ok) {
              toast.success("Deleted");
              router.refresh();
            } else toast.error(r.error);
          })
        }
      />
    </div>
  );
}
