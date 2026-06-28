"use client";

import { useRef, useState, useTransition } from "react";
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
  amount: string; // plain number string
  category: string | null;
  harvestId: string | null;
  isWage: boolean;
};

export function ImportExpenseSheetDialog({
  harvests,
}: {
  harvests: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [extracting, startExtract] = useTransition();
  const [saving, startSave] = useTransition();
  const router = useRouter();

  const [candidate, setCandidate] = useState<{ file: File; preview: string } | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null); // null = not extracted yet
  const [sheetTotal, setSheetTotal] = useState<string | null>(null);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);

  // Shared header fields applied to every saved line.
  const [date, setDate] = useState(today());
  const [payee, setPayee] = useState("Field purchase");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [allocateAll, setAllocateAll] = useState<string | null>(null);

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
    setDate(today());
    setPayee("Field purchase");
    setPaymentMethod("Cash");
    setAllocateAll(null);
  }

  function pickFile(file: File) {
    if (candidate) URL.revokeObjectURL(candidate.preview);
    setCandidate({ file, preview: URL.createObjectURL(file) });
    setRows(null);
  }

  function runExtract() {
    if (!candidate) return;
    startExtract(async () => {
      const fd = new FormData();
      fd.append("file", candidate.file);
      fd.append("keepPhoto", "1"); // attach the sheet photo to the saved expenses
      const r = await extractExpenseSheet(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const data = r.data;
      if (!data) {
        toast.error("Extraction returned nothing — try again.");
        return;
      }
      const extracted = data.lines.map((l, i) => ({
        key: `r${i}`,
        include: !l.isWage, // wages default OFF per Boyd's choice
        description: l.description,
        amount: l.amount,
        category: l.isWage ? "Wages" : l.category,
        harvestId: null as string | null,
        isWage: l.isWage,
      }));
      setRows(extracted);
      setSheetTotal(data.sheetTotal);
      setReceiptPath(data.path);
      if (extracted.length === 0) {
        toast.error("No line items found — try a clearer photo.");
      } else {
        toast.success(`Found ${extracted.length} line${extracted.length === 1 ? "" : "s"}`);
      }
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
        <Button variant="outline">
          <Camera className="h-4 w-4" /> Scan a sheet
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{rows ? "Review extracted expenses" : "Scan an expense sheet"}</DialogTitle>
        </DialogHeader>

        {/* Hidden inputs */}
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
          // ---- Step 1: capture / upload ----
          <div className="space-y-4 py-2">
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Photograph a handwritten expense list. AI reads every line, you review and
              tweak, then save them all at once. Wage (Gaji) lines are left unticked by default.
            </p>
            {candidate ? (
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={candidate.preview}
                  alt="sheet preview"
                  className="max-h-72 w-full rounded-md border object-contain"
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={runExtract} disabled={extracting}>
                    <Sparkles className="h-4 w-4" /> {extracting ? "Reading…" : "Extract lines"}
                  </Button>
                  <Button variant="ghost" onClick={() => pickFileReset()} disabled={extracting}>
                    <X className="h-4 w-4" /> Retake
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
          </div>
        ) : (
          // ---- Step 2: review ----
          <div className="space-y-4 py-2">
            {/* Shared controls */}
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
                <Label className="text-xs">Allocate all to greenhouse</Label>
                <Combobox
                  value={allocateAll}
                  onChange={(v) => applyAllocateAll(v)}
                  placeholder="Business overhead"
                  options={harvestOptions}
                />
              </div>
            </div>

            {/* Lines */}
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-8 p-2" />
                    <th className="p-2">Description</th>
                    <th className="p-2 text-right">Amount (Rp)</th>
                    <th className="p-2">Category</th>
                    <th className="p-2">Greenhouse</th>
                    <th className="w-8 p-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className={`border-t ${r.include ? "" : "opacity-50"}`}>
                      <td className="p-2 align-top">
                        <input
                          type="checkbox"
                          className="mt-2 h-4 w-4 accent-foreground"
                          checked={r.include}
                          onChange={(e) => patchRow(r.key, { include: e.target.checked })}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          value={r.description}
                          onChange={(e) => patchRow(r.key, { description: e.target.value })}
                          className="h-8"
                        />
                        {r.isWage ? (
                          <span className="mt-0.5 inline-block text-[10px] uppercase tracking-wide text-amber-600">
                            wage
                          </span>
                        ) : null}
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={r.amount}
                          onChange={(e) => patchRow(r.key, { amount: e.target.value })}
                          className="h-8 w-28 text-right"
                        />
                      </td>
                      <td className="p-2 align-top">
                        <div className="w-36">
                          <Combobox
                            value={r.category}
                            onChange={(v) => patchRow(r.key, { category: v })}
                            placeholder="—"
                            options={categoryOptions}
                            onCreate={(v) => patchRow(r.key, { category: v })}
                          />
                        </div>
                      </td>
                      <td className="p-2 align-top">
                        <div className="w-40">
                          <Combobox
                            value={r.harvestId}
                            onChange={(v) => patchRow(r.key, { harvestId: v })}
                            placeholder="Overhead"
                            options={harvestOptions}
                          />
                        </div>
                      </td>
                      <td className="p-2 align-top">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Remove line"
                          onClick={() =>
                            setRows((prev) => (prev ? prev.filter((x) => x.key !== r.key) : prev))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Reconciliation */}
            <div className="rounded-md bg-muted/30 px-3 py-2 text-sm">
              <strong>{included.length}</strong> selected · total{" "}
              <strong className="text-foreground">{fmt(includedTotal)}</strong>
              {sheetTotalNum ? (
                <span className="text-xs text-muted-foreground">
                  {" "}· sheet says {fmt(sheetTotalNum)}
                  {Math.abs(sheetTotalNum - includedTotal) > 1 ? (
                    <span className="text-amber-600">
                      {" "}(differs by {fmt(Math.abs(sheetTotalNum - includedTotal))} — wages/excluded
                      lines may account for it)
                    </span>
                  ) : null}
                </span>
              ) : null}
              {allocateAll ? (
                <div className="text-[11px] text-muted-foreground">
                  Allocated to {harvestName(allocateAll)} — change per row above if needed.
                </div>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter>
          {rows ? (
            <>
              <Button variant="ghost" onClick={reset} disabled={saving}>
                Start over
              </Button>
              <Button onClick={save} disabled={saving || included.length === 0}>
                {saving ? "Saving…" : `Save ${included.length} expense${included.length === 1 ? "" : "s"}`}
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

  function pickFileReset() {
    if (candidate) URL.revokeObjectURL(candidate.preview);
    setCandidate(null);
    setRows(null);
  }
}
