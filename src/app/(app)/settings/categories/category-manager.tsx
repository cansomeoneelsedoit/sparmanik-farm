"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addCategory, deleteCategory } from "@/app/(app)/settings/actions";

export function CategoryManager({ categories }: { categories: { id: string; name: string; itemCount: number }[] }) {
  const [name, setName] = useState("");
  const [pending, startT] = useTransition();
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" />
        <Button
          disabled={pending || !name.trim()}
          onClick={() =>
            startT(async () => {
              const r = await addCategory({ name: name.trim() });
              if (r.ok) {
                setName("");
                router.refresh();
              } else toast.error(r.error);
            })
          }
        >
          Add
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between p-3 text-sm">
            <div>
              <span className="font-medium">{c.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">{c.itemCount} item{c.itemCount === 1 ? "" : "s"}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending || c.itemCount > 0}
              title={c.itemCount > 0 ? "Has items — clear them first" : "Remove"}
              onClick={() =>
                startT(async () => {
                  const r = await deleteCategory(c.id);
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
