"use client";

import { useState, useTransition, type ReactNode } from "react";
import { todayWIB } from "@/lib/date";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { startHarvest, updateHarvest } from "@/app/(app)/harvest/actions";
import { createProduceQuick } from "@/app/(app)/settings/actions";

const today = () => todayWIB();
const schema = z.object({
  name: z.string().min(1),
  greenhouseId: z.string().min(1),
  // produceIds drives the join table; produceId stays in sync as the primary.
  produceIds: z.array(z.string()).default([]),
  variety: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  status: z.enum(["LIVE", "CLOSED"]).optional(),
});
type Form = z.infer<typeof schema>;

export function StartHarvestDialog({
  trigger,
  greenhouses,
  produces,
  existing,
}: {
  trigger: ReactNode;
  greenhouses: { id: string; name: string }[];
  produces: { id: string; name: string }[];
  existing?: {
    id: string;
    name: string;
    greenhouseId: string;
    produceIds: string[];
    variety: string | null;
    startDate: string;
    endDate: string | null;
    status: "LIVE" | "CLOSED";
  };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const [localProduces, setLocalProduces] = useState(produces);
  const [newProduceName, setNewProduceName] = useState("");
  const [addingProduce, setAddingProduce] = useState(false);
  const router = useRouter();
  const isEdit = !!existing;

  // Dedup the chip list — multi-org seeding occasionally creates "Green
  // Melon" twice on the same org. Show each name once, keep the first id
  // we saw so the user can still pick it.
  const dedupedProduces = (() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const p of localProduces) {
      const key = p.name.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  })();

  async function addProduceInline() {
    const name = newProduceName.trim();
    if (!name) return;
    // Don't create a duplicate — just select the existing one.
    const existingMatch = localProduces.find(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (existingMatch) {
      if (!selectedProduceIds.includes(existingMatch.id)) {
        form.setValue("produceIds", [...selectedProduceIds, existingMatch.id]);
      }
      setNewProduceName("");
      toast.message(`Already exists — selected "${existingMatch.name}"`);
      return;
    }
    setAddingProduce(true);
    try {
      const r = await createProduceQuick(name);
      if (r.ok && r.data) {
        const newProduce = { id: r.data.id, name: r.data.name };
        setLocalProduces((prev) => [...prev, newProduce]);
        form.setValue("produceIds", [...selectedProduceIds, newProduce.id]);
        setNewProduceName("");
        toast.success(`Added "${newProduce.name}"`);
      } else if (!r.ok) {
        toast.error(r.error);
      }
    } finally {
      setAddingProduce(false);
    }
  }
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: existing
      ? {
          name: existing.name,
          greenhouseId: existing.greenhouseId,
          produceIds: existing.produceIds,
          variety: existing.variety ?? "",
          startDate: existing.startDate,
          endDate: existing.endDate ?? "",
          status: existing.status,
        }
      : { name: "", startDate: today(), produceIds: [] },
  });

  const selectedProduceIds = form.watch("produceIds") ?? [];

  function toggleProduce(id: string) {
    const next = selectedProduceIds.includes(id)
      ? selectedProduceIds.filter((x) => x !== id)
      : [...selectedProduceIds, id];
    form.setValue("produceIds", next);
  }

  function onSubmit(v: Form) {
    startT(async () => {
      const ids = v.produceIds ?? [];
      if (isEdit) {
        const r = await updateHarvest(existing.id, {
          ...v,
          produceIds: ids,
          produceId: ids[0] ?? null,
          endDate: v.endDate || null,
          status: v.status ?? "LIVE",
        });
        if (r.ok) { toast.success("Saved"); setOpen(false); router.refresh(); }
        else toast.error(r.error);
      } else {
        const r = await startHarvest({
          ...v,
          produceIds: ids,
          produceId: ids[0] ?? null,
        });
        if (r.ok) {
          toast.success("Harvest started");
          setOpen(false);
          form.reset({ name: "", startDate: today(), produceIds: [] });
          router.refresh();
        } else toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader><DialogTitle>{isEdit ? "Edit harvest" : "Start a new harvest"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input {...form.register("name")} placeholder="Melon GH1 Round 4" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Greenhouse</Label>
                <Select value={form.watch("greenhouseId") ?? ""} onValueChange={(v) => form.setValue("greenhouseId", v)}>
                  <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                  <SelectContent>
                    {greenhouses.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Variety</Label>
                <Input {...form.register("variety")} placeholder="Yellow Melon" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Produces grown</Label>
              <p className="text-xs text-muted-foreground">
                Pick one or more — a single harvest can intercrop e.g. melon + chilli.
              </p>
              <div className="flex flex-wrap gap-1.5 rounded-md border p-2">
                {dedupedProduces.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    No produces yet. Type a name below to add the first.
                  </span>
                ) : (
                  dedupedProduces.map((p) => {
                    const on = selectedProduceIds.includes(p.id);
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => toggleProduce(p.id)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition",
                          on
                            ? "border-accent bg-accent/15 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-accent/60",
                        )}
                      >
                        {p.name}
                      </button>
                    );
                  })
                )}
              </div>
              {/* Inline "+ Add new produce" — also saves to Settings → Produce
                  so other pages see it too. No need to leave the dialog. */}
              <div className="flex gap-2">
                <Input
                  value={newProduceName}
                  onChange={(e) => setNewProduceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addProduceInline();
                    }
                  }}
                  placeholder="Add a new produce (e.g. Watermelon)"
                  className="flex-1 text-sm"
                  disabled={addingProduce}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addProduceInline}
                  disabled={addingProduce || !newProduceName.trim()}
                >
                  <Plus className="h-3.5 w-3.5" /> {addingProduce ? "Adding…" : "Add"}
                </Button>
              </div>
              {selectedProduceIds.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {selectedProduceIds.map((id) => {
                    const p = localProduces.find((x) => x.id === id);
                    if (!p) return null;
                    return (
                      <Badge key={id} variant="secondary" className="gap-1">
                        {p.name}
                        <button
                          type="button"
                          onClick={() => toggleProduce(id)}
                          className="ml-0.5 opacity-60 hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Start date</Label>
              <Input type="date" {...form.register("startDate")} />
            </div>
            {isEdit ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>End date</Label>
                  <Input type="date" {...form.register("endDate")} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.watch("status")} onValueChange={(v) => form.setValue("status", v as "LIVE" | "CLOSED")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LIVE">Live</SelectItem>
                      <SelectItem value="CLOSED">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save" : "Start"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
