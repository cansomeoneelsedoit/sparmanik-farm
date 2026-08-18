"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ruler, Trash2 } from "lucide-react";

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
import { addPlantMeasurement, deletePlantMeasurement } from "@/app/(app)/tags/actions";
import { todayWIB } from "@/lib/date";

export type MeasurementRow = {
  id: string;
  date: string;
  hst: number | null;
  heightCm: number | null;
  leafCount: number | null;
  stemMm: number | null;
  fruitCm: number | null;
  fruitG: number | null;
  brix: number | null;
  note: string | null;
};

/** "Measure" — numbers only, at today's HST. Feeds the per-variety growth chart. */
export function MeasureDialog({ recordId, tagLabel, trigger }: { recordId: string; tagLabel: string; trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [date, setDate] = useState(todayWIB());
  const [f, setF] = useState({ heightCm: "", leafCount: "", stemMm: "", fruitCm: "", fruitG: "", brix: "", note: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const any = ["heightCm", "leafCount", "stemMm", "fruitCm", "fruitG", "brix"].some((k) => f[k as keyof typeof f].trim() !== "");

  function save() {
    start(async () => {
      const r = await addPlantMeasurement({ recordId, date, ...f });
      if (r.ok) {
        toast.success(`Measurement saved on ${tagLabel}`);
        setOpen(false);
        setF({ heightCm: "", leafCount: "", stemMm: "", fruitCm: "", fruitG: "", brix: "", note: "" });
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const field = (k: keyof typeof f, label: string, ph: string, mode: "decimal" | "numeric" = "decimal") => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={f[k]} onChange={set(k)} placeholder={ph} inputMode={mode} className="h-10" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="h-10 w-full sm:h-9 sm:w-auto">
            <Ruler className="h-3.5 w-3.5" /> Measure
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Measure — {tagLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            Fill what you measured; leave the rest blank. The HST is worked out from the cycle&apos;s
            transplant date, so this plant lands on the variety growth chart for comparing cycles.
          </p>
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
          </div>
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0 sm:grid-cols-3">
            {field("heightCm", "Height (cm)", "e.g. 42")}
            {field("leafCount", "Leaves (count)", "e.g. 11", "numeric")}
            {field("stemMm", "Stem Ø (mm)", "e.g. 7.5")}
            {field("fruitCm", "Fruit Ø (cm)", "e.g. 6.0")}
            {field("fruitG", "Fruit weight (g)", "e.g. 350")}
            {field("brix", "Brix (°Bx)", "e.g. 14.5")}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Note (optional)</Label>
            <Input value={f.note} onChange={set("note")} placeholder="e.g. vigorous, slight yellowing low leaves" className="h-10" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !any}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MeasurementList({ rows }: { rows: MeasurementRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!rows.length) return <p className="text-sm text-muted-foreground">No measurements yet — tap Measure after you check the plant.</p>;
  const cell = (v: number | null, unit = "") => (v == null ? <span className="text-muted-foreground/50">—</span> : `${v}${unit}`);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr className="border-b">
            <th className="p-1.5 text-left">Date</th>
            <th className="p-1.5 text-right">HST</th>
            <th className="p-1.5 text-right">Height</th>
            <th className="p-1.5 text-right">Leaves</th>
            <th className="p-1.5 text-right">Stem</th>
            <th className="p-1.5 text-right">Fruit Ø</th>
            <th className="p-1.5 text-right">Fruit g</th>
            <th className="p-1.5 text-right">Brix</th>
            <th className="p-1.5 text-left">Note</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="p-1.5 font-mono">{r.date.slice(5)}</td>
              <td className="p-1.5 text-right font-mono">{r.hst ?? "—"}</td>
              <td className="p-1.5 text-right font-mono">{cell(r.heightCm, " cm")}</td>
              <td className="p-1.5 text-right font-mono">{cell(r.leafCount)}</td>
              <td className="p-1.5 text-right font-mono">{cell(r.stemMm, " mm")}</td>
              <td className="p-1.5 text-right font-mono">{cell(r.fruitCm, " cm")}</td>
              <td className="p-1.5 text-right font-mono">{cell(r.fruitG, " g")}</td>
              <td className="p-1.5 text-right font-mono">{cell(r.brix)}</td>
              <td className="p-1.5 text-muted-foreground">{r.note ?? ""}</td>
              <td className="p-0.5">
                <button
                  type="button"
                  disabled={pending}
                  className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
                  title="Delete"
                  onClick={() => {
                    if (!window.confirm("Delete this measurement?")) return;
                    start(async () => {
                      const x = await deletePlantMeasurement(r.id);
                      if (x.ok) router.refresh();
                      else toast.error(x.error);
                    });
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
