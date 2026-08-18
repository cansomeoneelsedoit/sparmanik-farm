"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, NotebookPen, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { addPlantNote, deletePlantNote } from "@/app/(app)/tags/actions";
import {
  PLANT_NOTE_KINDS,
  PLANT_NOTE_KIND_CLASS,
  PLANT_NOTE_KIND_LABEL,
  type PlantNoteKind,
} from "@/app/(app)/tags/journal-kinds";
import { todayWIB } from "@/lib/date";

export type JournalEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  kind: PlantNoteKind;
  product: string | null;
  amount: string | null;
  note: string;
  hasPhoto: boolean;
  /** Days after transplant on that date, when known. */
  hst: number | null;
};

/**
 * "Add journal entry" — a dated line on this plant: what you did (spray/feed),
 * with what and how much, or what you saw (issue/observation/result). Product
 * + amount are separate fields so they can be pulled into training material
 * and compared across plants later.
 */
export function AddJournalEntryDialog({
  recordId,
  tagLabel,
  trigger,
}: {
  recordId: string;
  tagLabel: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [date, setDate] = useState(todayWIB());
  const [kind, setKind] = useState<PlantNoteKind>("SPRAY");
  const [product, setProduct] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const usesProduct = kind === "SPRAY" || kind === "FEED";

  function reset() {
    setDate(todayWIB());
    setKind("SPRAY");
    setProduct("");
    setAmount("");
    setNote("");
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function save() {
    start(async () => {
      const fd = new FormData();
      fd.set("recordId", recordId);
      fd.set("date", date);
      fd.set("kind", kind);
      fd.set("product", product);
      fd.set("amount", amount);
      fd.set("note", note);
      const f = fileRef.current?.files?.[0];
      if (f) fd.set("photo", f);
      const r = await addPlantNote(fd);
      if (r.ok) {
        toast.success(`Journal entry added to ${tagLabel}`);
        setOpen(false);
        reset();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="h-10 w-full sm:h-9 sm:w-auto">
            <NotebookPen className="h-3.5 w-3.5" /> Add journal entry
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Journal — {tagLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1">
              <Label>What</Label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as PlantNoteKind)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {PLANT_NOTE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {PLANT_NOTE_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <div className="space-y-1">
              <Label>
                Product{" "}
                {usesProduct ? null : <span className="font-normal text-muted-foreground">(optional)</span>}
              </Label>
              <Input
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="e.g. YaraVita Bortrac"
                className="h-10"
              />
            </div>
            <div className="space-y-1">
              <Label>
                Amount / dose <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 2 mL/L · 300 mL sprayed"
                className="h-10"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notes / result</Label>
            <Textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                kind === "ISSUE"
                  ? "What's wrong? e.g. yellowing lower leaves, thrips on new growth"
                  : kind === "RESULT"
                    ? "What happened after? e.g. leaf spot cleared in 4 days"
                    : "Why, how, what you noticed…"
              }
            />
          </div>

          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setPreview(f ? URL.createObjectURL(f) : null);
              }}
            />
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Journal photo" className="max-h-44 w-full rounded-md border object-contain bg-muted/30" />
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Camera className="h-3.5 w-3.5" /> {preview ? "Change photo" : "Add photo"}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Timeline of journal entries, newest first. */
export function JournalTimeline({ entries }: { entries: JournalEntry[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!entries.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No entries yet. Log sprays, feeds, problems and what happened next — it becomes this
        plant&apos;s story for training and monitoring.
      </p>
    );
  }
  return (
    <ol className="space-y-3">
      {entries.map((e) => (
        <li key={e.id} className="flex gap-3">
          <div className="flex w-14 shrink-0 flex-col items-end pt-0.5 text-right">
            <span className="font-mono text-xs">{e.date.slice(5)}</span>
            {e.hst != null ? <span className="text-[10px] text-muted-foreground">HST {e.hst}</span> : null}
          </div>
          <div className="min-w-0 flex-1 rounded-md border p-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={cn("border-transparent text-[10px]", PLANT_NOTE_KIND_CLASS[e.kind])}>
                {PLANT_NOTE_KIND_LABEL[e.kind]}
              </Badge>
              {e.product ? <span className="font-medium">{e.product}</span> : null}
              {e.amount ? <span className="text-xs text-muted-foreground">· {e.amount}</span> : null}
              <button
                type="button"
                className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
                title="Delete entry"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm("Delete this journal entry?")) return;
                  start(async () => {
                    const r = await deletePlantNote(e.id);
                    if (r.ok) router.refresh();
                    else toast.error(r.error);
                  });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {e.note && e.note !== e.product ? (
              <p className="mt-1 whitespace-pre-wrap">{e.note}</p>
            ) : null}
            {e.hasPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/plant-notes/${e.id}/photo`}
                alt="Journal photo"
                loading="lazy"
                className="mt-2 max-h-56 rounded-md border object-contain bg-muted/30"
              />
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
