"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck, FileUp, Trash2 } from "lucide-react";

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
import { Combobox } from "@/components/ui/combobox";
import { assignSopToHarvest, buildSopFromPdfs, unassignSopFromHarvest } from "@/app/(app)/sops/actions";

/** Upload the EN and/or ID booklet → structured SOP (day-by-day + sections). */
export function BuildSopFromPdfDialog({ trigger }: { trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [category, setCategory] = useState("Melon");
  const enRef = useRef<HTMLInputElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const [enName, setEnName] = useState("");
  const [idName, setIdName] = useState("");

  function build() {
    const en = enRef.current?.files?.[0];
    const id = idRef.current?.files?.[0];
    if (!en && !id) {
      toast.error("Choose at least one PDF");
      return;
    }
    start(async () => {
      const fd = new FormData();
      if (en) fd.set("en", en);
      if (id) fd.set("id", id);
      fd.set("category", category);
      toast.message("Reading the booklet…");
      const r = await buildSopFromPdfs(fd);
      if (r.ok && r.data) {
        toast.success(`SOP built — ${r.data.days} scheduled days, ${r.data.sections} pages. Polishing the pages in the background…`);
        setOpen(false);
        router.push(`/sops/${r.data.id}`);
        router.refresh();
      } else toast.error(r.ok ? "Failed" : r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <FileUp className="h-4 w-4" /> Build from PDF
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Build an SOP from the booklet PDF</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            Upload the English and/or Indonesian booklet. The day-by-day table (HST, EC, water, pulses,
            job for the day) is read exactly as printed, and each page becomes a section with the EN/ID
            toggle. Upload both books for a fully bilingual SOP. After the build, the pages are polished into clean, book-style layout in the background (a few minutes) — you can use the schedule straight away.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>English PDF</Label>
              <input ref={enRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => setEnName(e.target.files?.[0]?.name ?? "")} />
              <Button type="button" variant="outline" className="w-full justify-start truncate" onClick={() => enRef.current?.click()}>
                <FileUp className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{enName || "Choose EN book…"}</span>
              </Button>
            </div>
            <div className="space-y-1">
              <Label>Indonesian PDF</Label>
              <input ref={idRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => setIdName(e.target.files?.[0]?.name ?? "")} />
              <Button type="button" variant="outline" className="w-full justify-start truncate" onClick={() => idRef.current?.click()}>
                <FileUp className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{idName || "Pilih buku ID…"}</span>
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Category</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Melon" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={build} disabled={pending || (!enName && !idName)}>
            {pending ? "Building…" : "Build SOP"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Put this SOP on a live cycle with its transplant date (HST 0). */
export function AssignSopDialog({
  sopId,
  harvests,
  trigger,
}: {
  sopId: string;
  harvests: { id: string; name: string; greenhouse: string; startDate: string }[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [harvestId, setHarvestId] = useState<string | null>(harvests[0]?.id ?? null);
  const [hst0, setHst0] = useState(harvests[0]?.startDate ?? "");

  function pick(id: string | null) {
    setHarvestId(id);
    const h = harvests.find((x) => x.id === id);
    if (h) setHst0(h.startDate);
  }

  function save() {
    if (!harvestId) return;
    start(async () => {
      const r = await assignSopToHarvest({ sopId, harvestId, hst0 });
      if (r.ok) {
        toast.success("SOP assigned — today's instructions now show on Tasks and the cycle page");
        setOpen(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <CalendarCheck className="h-3.5 w-3.5" /> Assign to a cycle
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run this SOP on a live cycle</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {harvests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No live cycles right now — start one under Harvest first.</p>
          ) : (
            <>
              <div className="space-y-1">
                <Label>Cycle (greenhouse)</Label>
                <Combobox
                  value={harvestId}
                  onChange={pick}
                  placeholder="Pick a live cycle"
                  options={harvests.map((h) => ({ value: h.id, label: `${h.name} — ${h.greenhouse}` }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Transplant date (HST 0)</Label>
                <Input type="date" value={hst0} onChange={(e) => setHst0(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">
                  Today&apos;s instruction = the row for today − this date. Defaults to the cycle start.
                </p>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !harvestId || !hst0}>
            {pending ? "Saving…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UnassignSopButton({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title="Remove from this cycle"
      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
      onClick={() => {
        if (!window.confirm("Remove this SOP from the cycle?")) return;
        start(async () => {
          const r = await unassignSopFromHarvest(assignmentId);
          if (r.ok) router.refresh();
          else toast.error(r.error);
        });
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
