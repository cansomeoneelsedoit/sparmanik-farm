"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  bulkCreateItems,
  previewInventoryExcel,
  type ImportPreview,
  type ParsedItemRow,
} from "@/app/(app)/inventory/actions";

export function ImportClient() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function onFile(file: File) {
    setUploading(true);
    setPreview(null);
    setFileName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await previewInventoryExcel(fd);
      if (r.ok && r.data) {
        setPreview(r.data);
        if (r.data.validRows.length === 0) {
          toast.error("No valid rows found");
        } else {
          toast.success(`Parsed ${r.data.validRows.length} rows`);
        }
      } else if (!r.ok) {
        toast.error(r.error);
      }
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function reset() {
    setPreview(null);
    setFileName(null);
  }

  function handleImport() {
    if (!preview || preview.validRows.length === 0) return;
    const n = preview.validRows.length;
    const withStock = preview.validRows.filter((r) => r.qty && Number(r.qty) > 0).length;
    const withPhotos = preview.validRows.filter((r) => r.photoPath).length;
    const msg = `Import ${n} item${n === 1 ? "" : "s"}?` +
      (withStock > 0 ? `\n· ${withStock} will land with stock (qty + price → new batch)` : "") +
      (withPhotos > 0 ? `\n· ${withPhotos} have photos extracted from the spreadsheet` : "") +
      "\n· Missing categories and suppliers will be created automatically.";
    if (!window.confirm(msg)) return;
    const rows: ParsedItemRow[] = preview.validRows;
    startTransition(async () => {
      const r = await bulkCreateItems(rows);
      if (r.ok && r.data) {
        const c = r.data;
        toast.success(
          `Imported ${c.created} items${c.batchesCreated ? ` · +${c.batchesCreated} batches` : ""}${c.categoriesAdded ? ` · +${c.categoriesAdded} categories` : ""}${c.suppliersAdded ? ` · +${c.suppliersAdded} suppliers` : ""}`,
        );
        router.push("/inventory");
        router.refresh();
      } else if (!r.ok) {
        toast.error(r.error);
      }
    });
  }

  return (
    <>
      <Card>
        <CardContent className="p-6">
          {!preview ? (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 text-center transition-colors",
                uploading
                  ? "border-muted-foreground/30 bg-muted/30"
                  : "border-muted-foreground/40 hover:border-accent hover:bg-accent/10",
              )}
            >
              <div className="rounded-full bg-muted p-3 text-muted-foreground">
                <Upload className="h-6 w-6" />
              </div>
              <div className="space-y-0.5">
                <div className="font-medium">
                  {uploading ? "Parsing…" : "Click to upload an Excel or CSV file"}
                </div>
                <div className="text-xs text-muted-foreground">
                  .xlsx, .xls, .csv — first sheet is used
                </div>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
            </button>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{fileName}</span>
                  <span className="text-muted-foreground">
                    · {preview.validRows.length} of {preview.totalRows} rows ready
                  </span>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={reset}>
                  Upload a different file
                </Button>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Column mapping
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {preview.detectedHeaders.map((h) => (
                    <div
                      key={h.raw}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                        h.mapped
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                          : "border-muted bg-muted/40 text-muted-foreground",
                      )}
                    >
                      {h.mapped ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      <span className="font-mono">{h.raw}</span>
                      {h.mapped ? (
                        <>
                          <span>→</span>
                          <span className="font-medium">{h.mapped}</span>
                        </>
                      ) : (
                        <span className="italic">ignored</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {preview.errors.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/30">
                  <div className="mb-1 font-medium text-amber-700 dark:text-amber-300">
                    {preview.errors.length} row{preview.errors.length === 1 ? "" : "s"} skipped
                  </div>
                  <ul className="space-y-0.5 text-amber-700/80 dark:text-amber-300/80">
                    {preview.errors.slice(0, 5).map((e, i) => (
                      <li key={i}>
                        Row {e.row}: {e.reason}
                      </li>
                    ))}
                    {preview.errors.length > 5 ? (
                      <li>… +{preview.errors.length - 5} more</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}

              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Preview (first 20 rows)
                </div>
                <div className="overflow-hidden rounded-md border">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="w-12 px-3 py-2 text-left font-medium">Photo</th>
                          <th className="px-3 py-2 text-left font-medium">Name</th>
                          <th className="px-3 py-2 text-left font-medium">Supplier</th>
                          <th className="px-3 py-2 text-right font-medium">Qty</th>
                          <th className="px-3 py-2 text-right font-medium">Unit price</th>
                          <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                          <th className="px-3 py-2 text-left font-medium">Category</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {preview.validRows.slice(0, 20).map((r, i) => {
                          const subtotal =
                            r.qty && r.unitPrice
                              ? (Number(r.qty) * Number(r.unitPrice)).toFixed(0)
                              : null;
                          return (
                            <tr key={i}>
                              <td className="px-3 py-1.5">
                                {r.photoPath ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={`/api/uploads/${r.photoPath}`}
                                    alt=""
                                    className="h-10 w-10 rounded border object-cover"
                                  />
                                ) : (
                                  <div className="h-10 w-10 rounded border border-dashed bg-muted/30" />
                                )}
                              </td>
                              <td className="px-3 py-1.5">
                                <div className="line-clamp-1 font-medium text-foreground">{r.name}</div>
                                {r.description ? (
                                  <div className="line-clamp-1 text-muted-foreground">
                                    {r.description}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground">
                                {r.supplierName ?? "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                {r.qty ? (
                                  <strong className="text-foreground">{r.qty}</strong>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-right text-muted-foreground">
                                {r.unitPrice ?? "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right font-medium">
                                {subtotal ? `Rp ${Number(subtotal).toLocaleString("id-ID")}` : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground">
                                {r.categoryName ?? "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {preview.validRows.length > 20 ? (
                    <div className="bg-muted/30 px-3 py-1.5 text-center text-xs text-muted-foreground">
                      … +{preview.validRows.length - 20} more rows
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t pt-4">
                <Button type="button" variant="ghost" onClick={reset} disabled={pending}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleImport}
                  disabled={pending || preview.validRows.length === 0}
                >
                  {pending
                    ? "Importing…"
                    : `Import ${preview.validRows.length} item${preview.validRows.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
