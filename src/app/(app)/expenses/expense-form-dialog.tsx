"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Camera,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  Sparkles,
  X,
} from "lucide-react";

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
  createExpense,
  updateExpense,
  extractReceipt,
} from "@/app/(app)/expenses/actions";

const today = () => new Date().toISOString().slice(0, 10);
const schema = z.object({
  date: z.string().min(1),
  amount: z.string().regex(/^[0-9.]+$/, "Number"),
  category: z.string().optional(),
  payee: z.string().min(1, "Who got paid?"),
  description: z.string().optional(),
  paymentMethod: z.string().optional(),
});
type Form = z.infer<typeof schema>;

const CATEGORY_OPTIONS = [
  "Contractor",
  "Utilities",
  "Rent",
  "Transport",
  "Repairs",
  "Permits / fees",
  "Marketing",
  "Other",
];

const PAYMENT_OPTIONS = ["Cash", "Bank transfer", "Card", "E-wallet"];

export function ExpenseFormDialog({
  trigger,
  harvests,
  existing,
  defaultHarvestId,
}: {
  trigger: ReactNode;
  harvests: { id: string; name: string }[];
  existing?: {
    id: string;
    date: string;
    amount: string;
    category: string | null;
    payee: string;
    description: string | null;
    harvestId: string | null;
    paymentMethod: string | null;
    receiptPath: string | null;
  };
  defaultHarvestId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const [harvestId, setHarvestId] = useState<string | null>(
    existing?.harvestId ?? defaultHarvestId ?? null,
  );
  const [receiptPath, setReceiptPath] = useState<string | null>(existing?.receiptPath ?? null);
  const [working, setWorking] = useState<"idle" | "ocr-keep" | "ocr-only">("idle");
  // The candidate file — set when the user picks/captures a file. Kept
  // ephemerally as an ObjectURL so the user can confirm or retake before
  // committing to OCR (and to a disk write). For non-image files
  // (PDF/Word/Excel) the preview is a file-type icon, not a thumbnail.
  const [candidate, setCandidate] = useState<
    { file: File; preview: string; kind: "image" | "pdf" | "doc" | "xls" } | null
  >(null);
  // Preview the stored photo when the user clicks the thumbnail.
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const isEdit = !!existing;
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: existing
      ? {
          date: existing.date,
          amount: existing.amount,
          category: existing.category ?? "",
          payee: existing.payee,
          description: existing.description ?? "",
          paymentMethod: existing.paymentMethod ?? "",
        }
      : {
          date: today(),
          amount: "0",
          category: "",
          payee: "",
          description: "",
          paymentMethod: "Cash",
        },
  });

  /** Map file → preview kind. Images get an ObjectURL thumbnail; PDFs
   * and Office files get a file-type icon so the dialog stays useful
   * even when there's no image to show. */
  function detectKind(file: File): "image" | "pdf" | "doc" | "xls" {
    const lower = file.name.toLowerCase();
    if (file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/.test(lower))
      return "image";
    if (file.type === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
    if (
      lower.endsWith(".doc") ||
      lower.endsWith(".docx") ||
      file.type.includes("word")
    )
      return "doc";
    if (
      lower.endsWith(".xls") ||
      lower.endsWith(".xlsx") ||
      file.type.includes("excel") ||
      file.type.includes("spreadsheet")
    )
      return "xls";
    // Unknown — let the server reject it with a clear toast.
    return "image";
  }

  function handleFileSelect(file: File) {
    // Hold the file in memory until the user picks "Keep & extract" or
    // "Extract only" — both run OCR; only the first writes to disk.
    if (candidate) URL.revokeObjectURL(candidate.preview);
    const kind = detectKind(file);
    // ObjectURL works for non-images too, but the <img> tag would render
    // a broken icon. We keep the URL around only for image previews.
    const preview = kind === "image" ? URL.createObjectURL(file) : "";
    setCandidate({ file, preview, kind });
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function clearCandidate() {
    if (candidate) URL.revokeObjectURL(candidate.preview);
    setCandidate(null);
  }

  /**
   * Send the candidate image to the OCR server action. When `keep` is true
   * the file is also stored under uploads/expenses/ and its path is set on
   * the form so it'll be persisted with the expense. When false the file is
   * processed and discarded.
   *
   * On success the extracted fields auto-fill any empty form field; we
   * deliberately don't clobber fields the user has already typed into.
   */
  async function runExtract(keep: boolean) {
    if (!candidate) return;
    setWorking(keep ? "ocr-keep" : "ocr-only");
    try {
      const fd = new FormData();
      fd.append("file", candidate.file);
      fd.append("keepPhoto", keep ? "1" : "0");
      const r = await extractReceipt(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const { fields, path } = r.data!;
      // Only overwrite fields the user hasn't touched. If they already typed
      // a payee, respect it.
      const current = form.getValues();
      if (fields.payee && !current.payee) form.setValue("payee", fields.payee);
      if (fields.amount && (!current.amount || current.amount === "0"))
        form.setValue("amount", fields.amount);
      if (fields.date) form.setValue("date", fields.date);
      if (fields.category && !current.category)
        form.setValue("category", fields.category);
      if (fields.paymentMethod && !current.paymentMethod)
        form.setValue("paymentMethod", fields.paymentMethod);
      if (fields.description && !current.description)
        form.setValue("description", fields.description);
      if (keep && path) {
        setReceiptPath(path);
        toast.success("Photo kept · fields filled");
      } else {
        toast.success("Fields filled · photo discarded");
      }
      clearCandidate();
    } finally {
      setWorking("idle");
    }
  }

  function onSubmit(v: Form) {
    startT(async () => {
      const payload = {
        ...v,
        category: v.category || null,
        description: v.description || null,
        paymentMethod: v.paymentMethod || null,
        harvestId,
        receiptPath,
      };
      const r = isEdit
        ? await updateExpense(existing.id, payload)
        : await createExpense(payload);
      if (r.ok) {
        toast.success(isEdit ? "Saved" : "Expense recorded");
        setOpen(false);
        if (!isEdit) {
          form.reset({
            date: today(),
            amount: "0",
            category: "",
            payee: "",
            description: "",
            paymentMethod: "Cash",
          });
          setHarvestId(defaultHarvestId ?? null);
          setReceiptPath(null);
        }
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit expense" : "Record an expense"}</DialogTitle>
            <p className="pt-1 text-xs text-muted-foreground">
              For one-off costs paid to non-staff: contractors, individuals
              paid cash or transfer, utilities, repairs.
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" {...form.register("date")} />
              </div>
              <div className="space-y-2">
                <Label>Amount (IDR)</Label>
                <Input type="number" step="any" min="0" {...form.register("amount")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Paid to</Label>
              <Input
                {...form.register("payee")}
                placeholder="Contractor name, individual, vendor…"
                autoFocus
              />
              {form.formState.errors.payee ? (
                <p className="text-xs text-destructive">{form.formState.errors.payee.message}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Combobox
                  value={form.watch("category") ?? ""}
                  onChange={(v) => form.setValue("category", v ?? "")}
                  placeholder="Pick or type"
                  options={CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }))}
                  onCreate={(typed) => form.setValue("category", typed)}
                />
              </div>
              <div className="space-y-2">
                <Label>Payment method</Label>
                <Combobox
                  value={form.watch("paymentMethod") ?? ""}
                  onChange={(v) => form.setValue("paymentMethod", v ?? "")}
                  placeholder="Pick or type"
                  options={PAYMENT_OPTIONS.map((p) => ({ value: p, label: p }))}
                  onCreate={(typed) => form.setValue("paymentMethod", typed)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assign to harvest (optional)</Label>
              <Combobox
                value={harvestId}
                onChange={(v) => setHarvestId(v)}
                placeholder="Leave blank for business overhead"
                options={harvests.map((h) => ({ value: h.id, label: h.name }))}
              />
              <p className="text-[10px] text-muted-foreground">
                Set to charge this expense to a specific harvest&apos;s P&amp;L.
                Leave blank to keep it on the main business P&amp;L only.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                {...form.register("description")}
                placeholder="e.g. fixed irrigation valve in GH2, electrical wiring upgrade…"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Receipt</Label>
              <p className="text-[10px] text-muted-foreground">
                Snap a photo or attach a file (JPG, PNG, PDF, Word, or Excel) — AI
                pulls payee / amount / date / category into the form above. Pick
                whether to keep the original afterwards.
              </p>

              {candidate ? (
                // OCR review — show the just-captured shot with the two
                // commit-paths: keep+extract OR extract-only.
                <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                  <div className="flex items-start gap-3">
                    {candidate.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={candidate.preview}
                        alt="Receipt preview"
                        className="h-28 w-28 shrink-0 rounded-md border object-cover"
                      />
                    ) : (
                      // Non-image file: render a file-type tile with the
                      // file name + size so the user can confirm they
                      // attached the right document before paying for OCR.
                      <div className="flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-md border bg-background p-2 text-center">
                        {candidate.kind === "pdf" ? (
                          <FileText className="h-8 w-8 text-rose-500" />
                        ) : candidate.kind === "xls" ? (
                          <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
                        ) : (
                          <FileText className="h-8 w-8 text-sky-600" />
                        )}
                        <span className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
                          {candidate.file.name}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          {(candidate.file.size / 1024).toFixed(0)} KB
                        </span>
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Ready to extract. Choose whether to keep the photo
                        with this expense for later review, or just read the
                        text and discard the image.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void runExtract(true)}
                          disabled={working !== "idle" || pending}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {working === "ocr-keep" ? "Working…" : "Keep & extract"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void runExtract(false)}
                          disabled={working !== "idle" || pending}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {working === "ocr-only" ? "Working…" : "Extract only"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={clearCandidate}
                          disabled={working !== "idle" || pending}
                        >
                          <X className="h-3.5 w-3.5" /> Retake
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {receiptPath ? (
                    <button
                      type="button"
                      onClick={() => setPreviewOpen(true)}
                      className="group relative"
                      title="Click to view full receipt"
                    >
                      {(() => {
                        // Existing receipts may be PDFs / Word / Excel
                        // (the new file types we accept). Render an
                        // appropriate tile so the user can still see
                        // what's there.
                        const lower = receiptPath.toLowerCase();
                        const isImage = /\.(jpe?g|png|webp|gif)$/.test(lower);
                        const isPdf = lower.endsWith(".pdf");
                        const isXls = /\.xlsx?$/.test(lower);
                        if (isImage) {
                          return (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/uploads/${receiptPath}`}
                              alt=""
                              className="h-20 w-20 rounded-md border object-cover transition group-hover:opacity-80"
                            />
                          );
                        }
                        return (
                          <div className="flex h-20 w-20 flex-col items-center justify-center rounded-md border bg-muted/30 text-center transition group-hover:bg-muted/50">
                            {isPdf ? (
                              <FileText className="h-7 w-7 text-rose-500" />
                            ) : isXls ? (
                              <FileSpreadsheet className="h-7 w-7 text-emerald-600" />
                            ) : (
                              <FileText className="h-7 w-7 text-sky-600" />
                            )}
                            <span className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                              {isPdf ? "PDF" : isXls ? "Excel" : "Doc"}
                            </span>
                          </div>
                        );
                      })()}
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setReceiptPath(null);
                        }}
                        className="absolute -right-1 -top-1 cursor-pointer rounded-full bg-background p-0.5 shadow"
                        role="button"
                        aria-label="Remove receipt"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </button>
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                      <ImagePlus className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={pending}
                    >
                      <Camera className="h-3.5 w-3.5" />
                      {receiptPath ? "Snap new" : "Take photo"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={pending}
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      Choose file
                    </Button>
                  </div>
                </div>
              )}

              {/* `capture="environment"` opens the rear camera directly on
                  mobile; on desktop it falls back to a file picker.
                  Camera path is image-only — there's no camera for PDFs. */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
              {/* File picker accepts JPG, PNG, PDF, Word, Excel. The MIME
                  types cover modern browsers; the file extensions are a
                  belt-and-braces fallback for environments that haven't
                  registered the MIME yet. */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.jpg,.jpeg,.png,.pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save" : "Record expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      {/* Lightbox preview when the user clicks the stored receipt thumb.
          For images we render inline; PDFs go into an iframe (every
          modern browser has a built-in PDF viewer); Word / Excel get a
          download link because there's no in-browser viewer we can
          rely on. */}
      {previewOpen && receiptPath ? (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Receipt</DialogTitle>
            </DialogHeader>
            <div className="flex justify-center p-2">
              {(() => {
                const url = `/api/uploads/${receiptPath}`;
                const lower = receiptPath.toLowerCase();
                if (/\.(jpe?g|png|webp|gif)$/.test(lower)) {
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt="Stored receipt"
                      className="max-h-[70vh] w-auto rounded-md border"
                    />
                  );
                }
                if (lower.endsWith(".pdf")) {
                  return (
                    <iframe
                      src={url}
                      title="Stored receipt"
                      className="h-[70vh] w-full rounded-md border"
                    />
                  );
                }
                return (
                  <div className="flex flex-col items-center gap-3 p-8 text-center">
                    <FileText className="h-12 w-12 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      This receipt is a {lower.endsWith(".doc") || lower.endsWith(".docx") ? "Word document" : "spreadsheet"}.
                    </p>
                    <Button asChild size="sm">
                      <a href={url} target="_blank" rel="noopener noreferrer" download>
                        Download
                      </a>
                    </Button>
                  </div>
                );
              })()}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </Dialog>
  );
}
