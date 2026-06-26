"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  addLabourTask,
  updateLabourTask,
  deleteLabourTask,
  setLabourTaskActive,
} from "@/app/(app)/settings/actions";

type Task = { id: string; name: string; sortOrder: number; active: boolean };

export function LabourTaskManager({ tasks }: { tasks: Task[] }) {
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pending, startT] = useTransition();
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New task name (e.g. Drip cleaning)"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!name.trim()) return;
              startT(async () => {
                const r = await addLabourTask({ name: name.trim() });
                if (r.ok) {
                  setName("");
                  router.refresh();
                } else toast.error(r.error);
              });
            }
          }}
        />
        <Button
          disabled={pending || !name.trim()}
          onClick={() =>
            startT(async () => {
              const r = await addLabourTask({ name: name.trim() });
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
        {tasks.length === 0 ? (
          <li className="p-6 text-center text-sm text-muted-foreground">
            No tasks yet. Add the first above.
          </li>
        ) : (
          tasks.map((t) => (
            <li
              key={t.id}
              className={`flex flex-wrap items-center justify-between gap-3 p-3 text-sm ${
                t.active ? "" : "opacity-50"
              }`}
            >
              {editId === t.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8"
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      disabled={pending || !editName.trim()}
                      onClick={() =>
                        startT(async () => {
                          const r = await updateLabourTask(t.id, {
                            name: editName.trim(),
                          });
                          if (r.ok) {
                            setEditId(null);
                            router.refresh();
                          } else toast.error(r.error);
                        })
                      }
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{t.active ? "Active" : "Archived"}</span>
                      <Switch
                        checked={t.active}
                        onCheckedChange={(v) =>
                          startT(async () => {
                            const r = await setLabourTaskActive(t.id, v);
                            if (r.ok) router.refresh();
                            else toast.error(r.error);
                          })
                        }
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditId(t.id);
                        setEditName(t.name);
                      }}
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        startT(async () => {
                          const r = await deleteLabourTask(t.id);
                          if (r.ok) router.refresh();
                          else toast.error(r.error);
                        })
                      }
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))
        )}
      </ul>
      <p className="text-[10px] text-muted-foreground">
        Archive (toggle off) anything you don&apos;t want offered anymore. Old
        labour entries that reference it still keep the original name.
      </p>
    </div>
  );
}
