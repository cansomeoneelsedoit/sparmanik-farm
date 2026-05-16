"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addGreenhouse, updateGreenhouse, deleteGreenhouse } from "@/app/(app)/settings/actions";

type GH = { id: string; name: string; location: string | null; type: string | null; harvestCount: number };

export function GreenhouseManager({ greenhouses }: { greenhouses: GH[] }) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eLoc, setELoc] = useState("");
  const [eType, setEType] = useState("");
  const [pending, startT] = useTransition();
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" />
        <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="Type" />
        <Button
          disabled={pending || !name.trim()}
          onClick={() =>
            startT(async () => {
              const r = await addGreenhouse({
                name: name.trim(),
                location: location.trim() || undefined,
                type: type.trim() || undefined,
              });
              if (r.ok) { setName(""); setLocation(""); setType(""); router.refresh(); }
              else toast.error(r.error);
            })
          }
        >
          Add
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {greenhouses.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            {editId === g.id ? (
              <>
                <div className="grid flex-1 grid-cols-3 gap-2">
                  <Input value={eName} onChange={(e) => setEName(e.target.value)} placeholder="Name" className="h-8" />
                  <Input value={eLoc} onChange={(e) => setELoc(e.target.value)} placeholder="Location" className="h-8" />
                  <Input value={eType} onChange={(e) => setEType(e.target.value)} placeholder="Type" className="h-8" />
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    disabled={pending || !eName.trim()}
                    onClick={() =>
                      startT(async () => {
                        const r = await updateGreenhouse(g.id, { name: eName.trim(), location: eLoc.trim() || undefined, type: eType.trim() || undefined });
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
                  <span className="font-medium">{g.name}</span>
                  {g.location ? <span className="ml-2 text-xs text-muted-foreground">{g.location}</span> : null}
                  {g.harvestCount > 0 ? <Badge variant="outline" className="ml-2">{g.harvestCount} harvest{g.harvestCount === 1 ? "" : "s"}</Badge> : null}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditId(g.id); setEName(g.name); setELoc(g.location ?? ""); setEType(g.type ?? ""); }}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending || g.harvestCount > 0}
                    onClick={() =>
                      startT(async () => {
                        const r = await deleteGreenhouse(g.id);
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
