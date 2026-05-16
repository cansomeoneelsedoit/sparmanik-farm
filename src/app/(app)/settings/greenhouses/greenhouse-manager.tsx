"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addGreenhouse, deleteGreenhouse } from "@/app/(app)/settings/actions";

type GH = { id: string; name: string; location: string | null; type: string | null; harvestCount: number };

export function GreenhouseManager({ greenhouses }: { greenhouses: GH[] }) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("");
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
              if (r.ok) {
                setName(""); setLocation(""); setType("");
                router.refresh();
              } else toast.error(r.error);
            })
          }
        >
          Add
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {greenhouses.map((g) => (
          <li key={g.id} className="flex items-center justify-between p-3 text-sm">
            <div>
              <span className="font-medium">{g.name}</span>
              {g.location ? <span className="ml-2 text-xs text-muted-foreground">{g.location}</span> : null}
              {g.harvestCount > 0 ? <Badge variant="outline" className="ml-2">{g.harvestCount} harvest{g.harvestCount === 1 ? "" : "s"}</Badge> : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending || g.harvestCount > 0}
              onClick={() =>
                startT(async () => {
                  const r = await deleteGreenhouse(g.id);
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
