"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Recycle } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import {
  previewReuseSetup,
  reuseSetupFromLastCycle,
  type ReuseSetupLine,
  type ReuseSetupPreview,
} from "@/app/(app)/harvest/actions";
import { todayWIB } from "@/lib/date";

const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

/**
 * "Same kit as last grow" — one click re-installs everything that came back in
 * good condition from the previous cycle in this greenhouse. Reusable kit is
 * charged at its per-use rate again (1/N of the outlay), so the cost spreads
 * across cycles the way Boyd runs it.
 */
export function ReuseSetupDialog({ harvestId }: { harvestId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, startT] = useTransition();
  const [preview, setPreview] = useState<ReuseSetupPreview | null>(null);
  const [date, setDate] = useState(todayWIB());
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [qtys, setQtys] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    previewReuseSetup(harvestId).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const p = r.data!;
      setPreview(p);
      const c: Record<string, boolean> = {};
      const q: Record<string, string> = {};
      for (const l of p.lines) {
        c[l.itemId] = !l.alreadyInstalled && l.qty > 0;
        q[l.itemId] = String(l.qty);
      }
      setChecked(c);
      setQtys(q);
    });
    return () => {
      cancelled = true;
    };
  }, [open, harvestId]);

  const selected = useMemo(
    () => (preview?.lines ?? []).filter((l) => checked[l.itemId] && Number(qtys[l.itemId]) > 0),
    [preview, checked, qtys],
  );
  const estTotal = selected.reduce((s, l) => {
    const q = Number(qtys[l.itemId]) || 0;
    const per = l.qty > 0 ? l.estCharge / l.qty : 0;
    return s + per * q;
  }, 0);

  function toggleAll(v: boolean) {
    const c: Record<string, boolean> = {};
    for (const l of preview?.lines ?? []) c[l.itemId] = v && l.available > 0;
    setChecked(c);
  }

  function run() {
    startT(async () => {
      const r = await reuseSetupFromLastCycle({
        harvestId,
        date,
        lines: selected.map((l) => ({ itemId: l.itemId, qty: qtys[l.itemId] })),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const { installed, failed } = r.data!;
      if (failed.length) {
        toast.warning(`Installed ${installed}; ${failed.length} couldn't be installed`, {
          description: failed
            .map((f) => `${preview?.lines.find((l) => l.itemId === f.itemId)?.name ?? f.itemId}: ${f.error}`)
            .slice(0, 4)
            .join(" · "),
        });
      } else {
        toast.success(`Installed ${installed} item${installed === 1 ? "" : "s"} from last cycle`);
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Recycle className="mr-1 h-3.5 w-3.5" /> Reuse last cycle&apos;s setup
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reuse last cycle&apos;s setup</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Looking at the last cycle…</p>
        ) : !preview?.sourceHarvest ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No earlier cycle in this greenhouse to copy from.
          </p>
        ) : preview.lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            The last cycle ({preview.sourceHarvest.name}) has no reusable kit recorded.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              From <strong className="text-foreground">{preview.sourceHarvest.name}</strong> (
              {preview.sourceHarvest.startDate}
              {preview.sourceHarvest.endDate ? ` → ${preview.sourceHarvest.endDate}` : ""}). Reusable kit is
              charged at its per-use share again — the outlay spreads across every cycle it serves.
            </p>

            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Install date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-44" />
              </div>
              <div className="flex gap-2 text-xs">
                <button type="button" className="underline" onClick={() => toggleAll(true)}>
                  Select all
                </button>
                <button type="button" className="underline" onClick={() => toggleAll(false)}>
                  None
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-8 p-2" />
                    <th className="p-2 text-left">Item</th>
                    <th className="p-2 text-right">Last time</th>
                    <th className="p-2 text-right">In stock</th>
                    <th className="p-2 text-right">Install</th>
                    <th className="p-2 text-right">Charge</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((l: ReuseSetupLine) => {
                    const short = l.available < l.lastQty;
                    const q = Number(qtys[l.itemId]) || 0;
                    const per = l.qty > 0 ? l.estCharge / l.qty : 0;
                    return (
                      <tr key={l.itemId} className="border-t align-top">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={!!checked[l.itemId]}
                            disabled={l.available <= 0}
                            onChange={(e) => setChecked((c) => ({ ...c, [l.itemId]: e.target.checked }))}
                          />
                        </td>
                        <td className="p-2">
                          <div className="line-clamp-2 max-w-[18rem]">{l.name}</div>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {l.depreciationMode ? (
                              <Badge variant="outline" className="text-[10px]">
                                {l.depreciationMode === "PER_USE" ? "per-use" : "calendar"}
                              </Badge>
                            ) : null}
                            {l.alreadyInstalled ? (
                              <Badge variant="secondary" className="text-[10px]">
                                already on this cycle
                              </Badge>
                            ) : null}
                            {short ? (
                              <Badge variant="outline" className="text-[10px] text-amber-700">
                                only {l.available} in stock
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-2 text-right font-mono text-xs">
                          {l.lastQty} {l.unit}
                        </td>
                        <td className="p-2 text-right font-mono text-xs">{l.available}</td>
                        <td className="p-2 text-right">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            max={l.available}
                            value={qtys[l.itemId] ?? ""}
                            onChange={(e) => setQtys((s) => ({ ...s, [l.itemId]: e.target.value }))}
                            className="ml-auto h-8 w-24 text-right font-mono text-xs"
                            disabled={!checked[l.itemId]}
                          />
                        </td>
                        <td className="p-2 text-right font-mono text-xs">{rp(per * q)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm">
              <span>
                {selected.length} item{selected.length === 1 ? "" : "s"} selected
              </span>
              <span>
                Charge to this cycle: <strong>{rp(estTotal)}</strong>
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={run} disabled={pending || selected.length === 0}>
            {pending ? "Installing…" : `Install ${selected.length || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
