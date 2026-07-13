"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer, QrCode, Sprout } from "lucide-react";
import { toast } from "sonner";

import { todayWIB } from "@/lib/date";

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
import { Combobox } from "@/components/ui/combobox";
import {
  assignPlant,
  createPlantTags,
  deletePlantTag,
  endPlantAllocation,
} from "@/app/(app)/tags/actions";

// WIB calendar day — a 6am Jakarta planting is still "today" there even
// though UTC is on the previous date.
const today = () => todayWIB();

/** Mint a batch of QR stakes for a greenhouse (GH1-001, GH1-002, …). */
export function CreateTagsDialog({
  greenhouseId,
  defaultPrefix,
}: {
  greenhouseId: string;
  defaultPrefix: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [count, setCount] = useState("10");
  const [prefix, setPrefix] = useState(defaultPrefix);

  function save() {
    start(async () => {
      const r = await createPlantTags({ greenhouseId, count, prefix });
      if (r.ok) {
        toast.success(`Created ${r.data?.created ?? count} tags`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <QrCode className="h-4 w-4" /> Add tags
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mint QR tags for this greenhouse</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Each tag is a QR stake that lives in this greenhouse and gets recycled crop after
            crop. Print the sheet, cut them out, laminate, and stake them with the plants.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>How many</Label>
              <Input
                type="number"
                min="1"
                max="200"
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Label prefix</Label>
              <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="GH1" />
              <p className="text-xs text-muted-foreground">
                Labels continue numbering: {prefix || "GH1"}-001, {prefix || "GH1"}-002…
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !prefix.trim() || !(Number(count) >= 1)}>
            {pending ? "Creating…" : "Create tags"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Drill into a single tag to see its actual QR code on screen, and print a
 * one-off sticker (QR + number). The QR image is only fetched once the dialog
 * opens (so a page full of tags doesn't fire a request per tag on load).
 */
export function ShowQrDialog({
  tagId,
  tagLabel,
  code,
  greenhouseName,
}: {
  tagId: string;
  tagLabel: string;
  code: string;
  greenhouseName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <QrCode className="h-3.5 w-3.5" /> QR
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tagLabel}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          {open ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/tags/${tagId}/qr`}
              alt={`QR code for ${tagLabel}`}
              className="h-56 w-56 rounded-md border bg-white p-2"
            />
          ) : null}
          <div className="text-center">
            <div className="text-lg font-semibold tracking-wide">{tagLabel}</div>
            {greenhouseName ? (
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {greenhouseName}
              </div>
            ) : null}
            <div className="mt-1 text-xs text-muted-foreground">/t/{code}</div>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Scan this in the greenhouse to open the plant, or print it as a sticker for the stake.
          </p>
        </div>
        <DialogFooter>
          <Button asChild variant="outline">
            <a href={`/print/tag/${tagId}?auto=1`} target="_blank" rel="noreferrer">
              <Printer className="h-4 w-4" /> Print sticker
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Stake the tag with a (new) plant — ends the current stay, starts the next. */
export function AssignPlantDialog({
  tagId,
  tagLabel,
  produces,
  current,
  trigger,
}: {
  tagId: string;
  tagLabel: string;
  produces: { id: string; name: string }[];
  /** The live record's values, when re-staking an occupied tag. */
  current?: { produceId: string | null; seed: string | null; method: string | null } | null;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [produceId, setProduceId] = useState<string | null>(current?.produceId ?? null);
  const [plantedAt, setPlantedAt] = useState(today());
  const [seed, setSeed] = useState(current?.seed ?? "");
  const [method, setMethod] = useState(current?.method ?? "");
  const [notes, setNotes] = useState("");

  function save() {
    start(async () => {
      const r = await assignPlant({
        tagId,
        produceId: produceId || undefined,
        plantedAt,
        seed,
        method,
        notes,
      });
      if (r.ok) {
        toast.success(`Tag ${tagLabel} staked`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Sprout className="h-3.5 w-3.5" /> {current ? "Re-stake" : "Assign plant"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stake {tagLabel} with a plant</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {current ? (
            <p className="rounded-md border bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              This tag is currently staked — saving ends the current plant&apos;s record and
              starts this one. The old record stays in the tag&apos;s history.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <div className="space-y-1">
              <Label>Produce / variety</Label>
              <Combobox
                value={produceId}
                onChange={setProduceId}
                placeholder="e.g. G Rock Melon"
                options={produces.map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Planted on</Label>
              <Input type="date" value={plantedAt} onChange={(e) => setPlantedAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>
              Seed <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="e.g. Known-You G Rock F1, lot 24-08"
            />
          </div>
          <div className="space-y-1">
            <Label>
              Method <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="e.g. Dutch bucket, cocopeat, 2 L/h dripper"
            />
          </div>
          <div className="space-y-1">
            <Label>
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth remembering about this plant"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Stake it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pull the stake — ends the current plant's record, tag becomes free. */
export function EndAllocationButton({ tagId, tagLabel }: { tagId: string; tagLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await endPlantAllocation(tagId);
          if (r.ok) {
            toast.success(`Tag ${tagLabel} is free`);
            router.refresh();
          } else {
            toast.error(r.error);
          }
        })
      }
    >
      {pending ? "…" : "Free tag"}
    </Button>
  );
}

/** Destroy a stake + its history (owner only, double-confirmed). */
export function DeleteTagButton({ tagId, tagLabel }: { tagId: string; tagLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-destructive hover:text-destructive"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Delete tag ${tagLabel} and its whole plant history?`)) return;
        start(async () => {
          const r = await deletePlantTag(tagId);
          if (r.ok) {
            toast.success(`Tag ${tagLabel} deleted`);
            router.refresh();
          } else {
            toast.error(r.error);
          }
        });
      }}
    >
      Delete
    </Button>
  );
}
