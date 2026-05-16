"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addCategory, updateCategory, deleteCategory } from "@/app/(app)/settings/actions";

export function CategoryManager({ categories }: { categories: { id: string; name: string; itemCount: number }[] }) {
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
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
              if (r.ok) { setName(""); router.refresh(); }
              else toast.error(r.error);
            })
          }
        >
          Add
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            {editId === c.id ? (
              <>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" autoFocus />
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    disabled={pending || !editName.trim()}
                    onClick={() =>
                      startT(async () => {
                        const r = await updateCategory(c.id, { name: editName.trim() });
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
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{c.itemCount} item{c.itemCount === 1 ? "" : "s"}</span>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setEditId(c.id); setEditName(c.name); }}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
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
