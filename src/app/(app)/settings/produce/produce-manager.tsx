"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addProduce, updateProduce, deleteProduce } from "@/app/(app)/settings/actions";

export function ProduceManager({ produces }: { produces: { id: string; name: string; barcode: string | null }[] }) {
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBarcode, setEditBarcode] = useState("");
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
              if (r.ok) { setName(""); setBarcode(""); router.refresh(); }
              else toast.error(r.error);
            })
          }
        >
          Add
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {produces.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            {editId === p.id ? (
              <>
                <div className="flex flex-1 gap-2">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" className="h-8" />
                  <Input value={editBarcode} onChange={(e) => setEditBarcode(e.target.value)} placeholder="Barcode" className="h-8" />
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    disabled={pending || !editName.trim()}
                    onClick={() =>
                      startT(async () => {
                        const r = await updateProduce(p.id, { name: editName.trim(), barcode: editBarcode.trim() || undefined });
                        if (r.ok) { setEditId(null); router.refresh(); }
                        else toast.error(r.error);
                      })
                    }
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="font-medium">{p.name}</span>
                  {p.barcode ? <span className="ml-2 font-mono text-xs text-muted-foreground">{p.barcode}</span> : null}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditId(p.id); setEditName(p.name); setEditBarcode(p.barcode ?? ""); }}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      startT(async () => {
                        const r = await deleteProduce(p.id);
                        if (r.ok) router.refresh();
                        else toast.error(r.error);
                      })
                    }
                  >
                    <X className="h-3 w-3" /> Remove
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
