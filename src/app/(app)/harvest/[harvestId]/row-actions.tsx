"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deleteSale, deleteHarvestUsage, deleteHarvestAsset } from "@/app/(app)/harvest/actions";

export function DeleteSaleButton({ id }: { id: string }) {
  return <DeleteIcon id={id} action={deleteSale} label="Delete sale" />;
}

export function DeleteUsageButton({ id }: { id: string }) {
  return <DeleteIcon id={id} action={deleteHarvestUsage} label="Delete usage" />;
}

export function DeleteAssetButton({ id }: { id: string }) {
  return <DeleteIcon id={id} action={deleteHarvestAsset} label="Delete asset" />;
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
