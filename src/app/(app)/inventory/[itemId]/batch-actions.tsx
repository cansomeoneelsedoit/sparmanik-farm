"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deleteBatch } from "@/app/(app)/inventory/actions";

export function DeleteBatchButton({ id }: { id: string }) {
  const [pending, startT] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="icon"
      variant="ghost"
      disabled={pending}
      title="Delete batch"
      onClick={() =>
        startT(async () => {
          const r = await deleteBatch(id);
          if (r.ok) {
            toast.success("Batch deleted");
            router.refresh();
          } else {
            toast.error(r.error);
          }
        })
      }
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
