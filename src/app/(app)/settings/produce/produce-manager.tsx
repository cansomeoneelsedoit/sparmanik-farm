"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addProduce, deleteProduce } from "@/app/(app)/settings/actions";

export function ProduceManager({ produces }: { produces: { id: string; name: string; barcode: string | null }[] }) {
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [pending, startT] = useTransition();
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Produce name" />
        <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Barcode (optional)" />
        <Button
          disabled={pending || !name.trim()}
          onClick={() =>
            startT(async () => {
              const r = await addProduce({ name: name.trim(), barcode: barcode.trim() || undefined });
              if (r.ok) {
                setName("");
                setBarcode("");
                router.refresh();
              } else toast.error(r.error);
            })
          }
        >
          Add
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {produces.map((p) => (
          <li key={p.id} className="flex items-center justify-between p-3 text-sm">
            <div>
              <span className="font-medium">{p.name}</span>
              {p.barcode ? <span className="ml-2 font-mono text-xs text-muted-foreground">{p.barcode}</span> : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                startT(async () => {
                  const r = await deleteProduce(p.id);
                  if (r.ok) router.refresh();
                  else toast.error(r.error);
                })
              }
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
