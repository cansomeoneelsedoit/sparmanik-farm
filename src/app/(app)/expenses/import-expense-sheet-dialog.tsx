"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, ImagePlus, Sparkles, Trash2, X } from "lucide-react";

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
import { extractExpenseSheet, createExpensesBulk } from "@/app/(app)/expenses/actions";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";

const today = () => new Date().toISOString().slice(0, 10);
const PAYMENT_OPTIONS = ["Cash", "Bank transfer", "Card", "E-wallet"];
const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

type Row = {
  key: string;
  include: boolean;
  description: string;
  amount: string;
  category: string | null;
  harvestId: string | null;
  isWage: boolean;
};

export function ImportExpenseSheetDialog({
  harvests,
  defaultHarvestId = null,
  trigger,
}: {
  harvests: { id: string; name: string }[];
  /** When opened from a greenhouse, pre-allocate every line to it. */
  defaultHarvestId?: string | null;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [extracting, startExtract] = useTransition();
  const [saving, startSave] = useTransition();
  const router = useRouter();

  const [candidate, setCandidate] = useState<{ file: File; preview: string } | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null); // null = not extracted yet
  const [sheetTotal, setSheetTotal] = useState<string | null>(null);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null); // what the AI returned when nothing parsed

  const [date, setDate] = useState(today());
  const [payee, setPayee] = useState("Field purchase");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [allocateAll, setAllocateAll] = useState<string | null>(defaultHarvestId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const harvestOptions = harvests.map((h) => ({ value: h.id, label: h.name }));
  const categoryOptions = EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }));
  const harvestName = (id: string | null) => harvests.find((h) => h.id === id)?.name ?? null;

  function reset() {
    if (candidate) URL.revokeObjectURL(candidate.preview);
    setCandidate(null);
    setRows(null);
    setSheetTotal(null);
    setReceiptPath(null);
    setAiNote(null);
    setDate(today());
    setPayee("Field purchase");
    setPaymentMethod("Cash");
    setAllocateAll(defaultHarvestId);
  }

  function clearCandidate() {
    if (candidate) URL.revokeObjectURL(candidate.preview);
    setCandidate(null);
    setRows(null);
    setAiNote(null);
  }

  function pickFile(file: File) {
    if (candidate) URL.revokeObjectURL(candidate.preview);
    setCandidate({ file, preview: URL.createObjectURL(file) });
    setRows(null);
    setAiNote(null);
  }

  function runExtract() {
    if (!candidate) return;
    setAiNote(null);
    startExtract(async () => {
      const fd = new FormData();
      fd.append("file", candidate.file);
      fd.append("keepPhoto", "1");
      const r = await extractExpenseSheet(fd);
      if (!r.ok) {
        toast.error(r.error);
        setAiNote(r.error);
        return;
      }
      const data = r.data;
      if (!data || data.lines.length === 0) {
        // Stay on the capture step and show what the AI actually saw.
        setReceiptPath(data?.path ?? null);
        setAiNote(
          data?.rawText?.trim() ||
            "The AI didn't find any line items on this photo.",
        );
        toast.error("Couldn't read any lines — see the note below and try again.");
        return;
      }
      setRows(
        data.lines.map((l, i) => ({
          key: `r${i}`,
          include: !l.isWage, // wages OFF by default
          description: l.description,
          amount: l.amount,
          category: l.isWage ? "Wages" : l.category,
          harvestId: defaultHarvestId,
          isWage: l.isWage,
        })),
      );
      setSheetTotal(data.sheetTotal);
      setReceiptPath(data.path);
      setAiNote(null);
      toast.success(`Found ${data.lines.length} line${data.lines.length === 1 ? "" : "s"}`);
    });
  }

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((prev) => (prev ? prev.map((r) => (r.key === key ? { ...r, ...patch } : r)) : prev));
  }

  function applyAllocateAll(harvestId: string | null) {
    setAllocateAll(harvestId);
    setRows((prev) => (prev ? prev.map((r) => ({ ...r, harvestId })) : prev));
  }

  const included = rows?.filter((r) => r.include) ?? [];
  const includedTotal = included.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const sheetTotalNum = sheetTotal ? Number(sheetTotal) : null;

  function save() {
    if (!rows) return;
    const lines = included
      .filter((r) => Number(r.amount) > 0)
      .map((r) => ({
        description: r.description || null,
        amount: r.amount,
        category: r.category || null,
        harvestId: r.harvestId || null,
      }));
    if (lines.length === 0) {
      toast.error("Tick at least one line with an amount.");
      return;
    }
    if (!payee.trim()) {
      toast.error("Enter who paid (payee).");
      return;
    }
    startSave(async () => {
      const r = await createExpensesBulk({
        date,
        payee: payee.trim(),
        paymentMethod: paymentMethod || null,
        receiptPath,
        lines,
      });
      if (r.ok) {
        toast.success(`Saved ${r.data?.count ?? lines.length} expenses`);
        setOpen(false);
        reset();
        router.refresh();
      } else {
        toast.error(r.error);
      }
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
          <Button variant="outline">
            <Camera className="h-4 w-4" /> Scan a sheet
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{rows ? "Review the expenses" : "Scan an expense sheet"}</DialogTitle>
        </DialogHeader>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
            e.target.value = "";
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
            e.target.value = "";
          }}
        />

        {!rows ? (
          // ---------- Step 1: capture ----------
          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Photograph a handwritten list of things bought/paid for. The AI reads every
              line, then you check it and save them all at once.
              {defaultHarvestId ? (
                <> Lines will go to <strong>{harvestName(defaultHarvestId)}</strong>.</>
              ) : null}
              <ul className="mt-1.5 list-disc pl-4">
                <li>Lay the page flat, fill the frame, good light.</li>
                <li>Wage (Gaji) lines come in unticked — tick them on if you want them.</li>
              </ul>
            </div>

            {candidate ? (
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={candidate.preview}
                  alt="sheet preview"
                  className="max-h-80 w-full rounded-md border object-contain"
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={runExtract} disabled={extracting}>
                    <Sparkles className="h-4 w-4" />
                    {extracting ? "Reading the sheet…" : "Read the sheet"}
                  </Button>
                  <Button variant="ghost" onClick={clearCandidate} disabled={extracting}>
                    <X className="h-4 w-4" /> Choose another
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="h-4 w-4" /> Take photo
                </Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus className="h-4 w-4" /> Choose file
                </Button>
              </div>
            )}

            {aiNote ? (
              <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="font-medium">Couldn’t pull out line items.</div>
                <div>
                  Try a clearer, flatter, brighter photo that fills the frame. If it keeps
                  failing, you can still add expenses with <strong>New expense</strong>.
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-amber-700/80">What the AI saw</summary>
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[10px] text-amber-900/80 dark:text-amber-100/70">
                    {aiNote}
                  </pre>
                </details>
              </div>
            ) : null}
          </div>
        ) : (
          // ---------- Step 2: review ----------
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Paid by (payee)</Label>
                <Input value={payee} onChange={(e) => setPayee(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Payment method</Label>
                <Combobox
                  value={paymentMethod}
                  onChange={(v) => setPaymentMethod(v ?? "")}
                  placeholder="Cash"
                  options={PAYMENT_OPTIONS.map((p) => ({ value: p, label: p }))}
                  onCreate={(v) => setPaymentMethod(v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Put all on greenhouse</Label>
                <Combobox
                  value={allocateAll}
                  onChange={(v) => applyAllocateAll(v)}
                  placeholder="Business overhead"
                  options={harvestOptions}
                />
              </div>
            </div>

            {/* Card per line — stacks cleanly on a phone, no horizontal scroll. */}
            <div className="space-y-2">
              {rows.map((r) => (
                <div
                  key={r.key}
                  className={`rounded-lg border p-3 ${r.include ? "" : "opacity-60"}`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-2 h-4 w-4 shrink-0 accent-foreground"
                      checked={r.include}
                      onChange={(e) => patchRow(r.key, { include: e.target.checked })}
                    />
                    <Input
                      value={r.description}
                      onChange={(e) => patchRow(r.key, { description: e.target.value })}
                      placeholder="What was it?"
                      className="h-8 min-w-0 flex-1"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Remove line"
                      className="shrink-0"
                      onClick={() =>
                        setRows((prev) => (prev ? prev.filter((x) => x.key !== r.key) : prev))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 pl-6 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Amount (Rp)</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={r.amount}
                        onChange={(e) => patchRow(r.key, { amount: e.target.value })}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Category</Label>
                      <Combobox
                        value={r.category}
                        onChange={(v) => patchRow(r.key, { category: v })}
                        placeholder="—"
                        options={categoryOptions}
                        onCreate={(v) => patchRow(r.key, { category: v })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Greenhouse</Label>
                      <Combobox
                        value={r.harvestId}
                        onChange={(v) => patchRow(r.key, { harvestId: v })}
                        placeholder="Overhead"
                        options={harvestOptions}
                      />
                    </div>
                  </div>
                  {r.isWage ? (
                    <div className="mt-1 pl-6 text-[10px] uppercase tracking-wide text-amber-600">
                      wage — off by default
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="rounded-md bg-muted/30 px-3 py-2 text-sm">
              <strong>{included.length}</strong> selected · total{" "}
              <strong className="text-foreground">{fmt(includedTotal)}</strong>
              {sheetTotalNum ? (
                <span className="text-xs text-muted-foreground">
                  {" "}· sheet says {fmt(sheetTotalNum)}
                  {Math.abs(sheetTotalNum - includedTotal) > 1 ? (
                    <span className="text-amber-600">
                      {" "}(differs — unticked/wage lines may account for it)
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter>
          {rows ? (
            <>
              <Button variant="ghost" onClick={clearCandidate} disabled={saving}>
                Start over
              </Button>
              <Button onClick={save} disabled={saving || included.length === 0}>
                {saving
                  ? "Saving…"
                  : `Save ${included.length} expense${included.length === 1 ? "" : "s"}`}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
