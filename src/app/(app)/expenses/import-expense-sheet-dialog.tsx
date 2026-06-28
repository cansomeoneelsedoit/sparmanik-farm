"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  defaultHarvestId?: string | null;
  trigger?: ReactNode;
}) {
  const t = useTranslations("importSheet");
  const [open, setOpen] = useState(false);
  const [extracting, startExtract] = useTransition();
  const [saving, startSave] = useTransition();
  const router = useRouter();

  const [candidate, setCandidate] = useState<{ file: File; preview: string } | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sheetTotal, setSheetTotal] = useState<string | null>(null);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const [date, setDate] = useState(today());
  const [payee, setPayee] = useState(() => t("defaultPayee"));
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
    setPayee(t("defaultPayee"));
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
        setReceiptPath(data?.path ?? null);
        setAiNote(data?.rawText?.trim() || t("failTitle"));
        toast.error(t("toastFail"));
        return;
      }
      setRows(
        data.lines.map((l, i) => ({
          key: `r${i}`,
          include: !l.isWage,
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
      toast.success(t("toastFound", { count: data.lines.length }));
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
      toast.error(t("errPickOne"));
      return;
    }
    if (!payee.trim()) {
      toast.error(t("errPayee"));
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
        toast.success(t("toastSaved", { count: r.data?.count ?? lines.length }));
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
            <Camera className="h-4 w-4" /> {t("trigger")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{rows ? t("titleReview") : t("titleScan")}</DialogTitle>
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
          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {t("blurb")}
              {defaultHarvestId ? (
                <> {t("blurbGreenhouse", { name: harvestName(defaultHarvestId) ?? "" })}</>
              ) : null}
              <ul className="mt-1.5 list-disc pl-4">
                <li>{t("tipFlat")}</li>
                <li>{t("tipWages")}</li>
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
                    {extracting ? t("reading") : t("read")}
                  </Button>
                  <Button variant="ghost" onClick={clearCandidate} disabled={extracting}>
                    <X className="h-4 w-4" /> {t("chooseAnother")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="h-4 w-4" /> {t("takePhoto")}
                </Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus className="h-4 w-4" /> {t("chooseFile")}
                </Button>
              </div>
            )}

            {aiNote ? (
              <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="font-medium">{t("failTitle")}</div>
                <div>{t("failBody")}</div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-amber-700/80">{t("aiSaw")}</summary>
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[10px] text-amber-900/80 dark:text-amber-100/70">
                    {aiNote}
                  </pre>
                </details>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("date")}</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("payee")}</Label>
                <Input value={payee} onChange={(e) => setPayee(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("paymentMethod")}</Label>
                <Combobox
                  value={paymentMethod}
                  onChange={(v) => setPaymentMethod(v ?? "")}
                  placeholder="Cash"
                  options={PAYMENT_OPTIONS.map((p) => ({ value: p, label: p }))}
                  onCreate={(v) => setPaymentMethod(v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("allocateAll")}</Label>
                <Combobox
                  value={allocateAll}
                  onChange={(v) => applyAllocateAll(v)}
                  placeholder={t("overhead")}
                  options={harvestOptions}
                />
              </div>
            </div>

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
                      placeholder={t("descPlaceholder")}
                      className="h-8 min-w-0 flex-1"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      title={t("removeLine")}
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
                      <Label className="text-[10px] text-muted-foreground">{t("amount")}</Label>
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
                      <Label className="text-[10px] text-muted-foreground">{t("category")}</Label>
                      <Combobox
                        value={r.category}
                        onChange={(v) => patchRow(r.key, { category: v })}
                        placeholder="—"
                        options={categoryOptions}
                        onCreate={(v) => patchRow(r.key, { category: v })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">{t("greenhouse")}</Label>
                      <Combobox
                        value={r.harvestId}
                        onChange={(v) => patchRow(r.key, { harvestId: v })}
                        placeholder={t("overheadShort")}
                        options={harvestOptions}
                      />
                    </div>
                  </div>
                  {r.isWage ? (
                    <div className="mt-1 pl-6 text-[10px] uppercase tracking-wide text-amber-600">
                      {t("wageHint")}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="rounded-md bg-muted/30 px-3 py-2 text-sm">
              {t("selectedSummary", { count: included.length, total: fmt(includedTotal) })}
              {sheetTotalNum ? (
                <span className="text-xs text-muted-foreground">
                  {" · "}
                  {t("sheetSays", { total: fmt(sheetTotalNum) })}
                  {Math.abs(sheetTotalNum - includedTotal) > 1 ? (
                    <span className="text-amber-600"> {t("differs")}</span>
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
                {t("startOver")}
              </Button>
              <Button onClick={save} disabled={saving || included.length === 0}>
                {saving ? `${t("save", { count: included.length })}…` : t("save", { count: included.length })}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
