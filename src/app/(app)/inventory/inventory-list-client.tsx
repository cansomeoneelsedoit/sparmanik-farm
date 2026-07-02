"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SmartImage } from "@/components/shared/smart-image";
import { CategoryChipLink } from "@/app/(app)/inventory/category-chip-link";
import { deleteItems } from "@/app/(app)/inventory/actions";

export type InventoryRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  photoPath: string | null;
  unit: string;
  /** For "sold as pack" items (e.g. drip pipe roll measured in metres):
   *  the sub-unit noun. Null on regular discrete items. */
  subUnit: string | null;
  /** Sub-units per pack — e.g. 500 metres per 1 roll. Null on regular items. */
  subFactor: string | null;
  reorder: string; // serialised Decimal
  stock: string; // serialised Decimal (in pack units, e.g. rolls)
  /** Pre-formatted by the server-side <Money> component so this client
   * file doesn't need to import @/server/money (which transitively pulls
   * Prisma into the client bundle). */
  valueFormatted: string;
  categoryName: string | null;
  /** "X of Y uses left" surfaced on items with a reusable batch.
   * Null when there is no reusable batch. */
  usesRemaining: number | null;
  usesMax: number | null;
  low: boolean;
  crit: boolean;
};

/**
 * Client-side inventory list with bulk selection. Renders the same row
 * layout as the server-side list view did, but adds a checkbox column and
 * a "Delete selected" toolbar that appears whenever at least one row is
 * ticked. Used after the user imports from Excel and wants to drop a few
 * rows that came in by mistake.
 */
export function InventoryListClient({ rows }: { rows: InventoryRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    );
  }

  function clear() {
    setSelected(new Set());
  }

  function handleDelete() {
    if (selected.size === 0) return;
    const n = selected.size;
    if (
      !window.confirm(
        `Delete ${n} item${n === 1 ? "" : "s"}? This also removes their batches, consumptions, and any harvest references. This cannot be undone.`,
      )
    ) {
      return;
    }
    const ids = Array.from(selected);
    startTransition(async () => {
      const r = await deleteItems(ids);
      if (r.ok) {
        toast.success(`Deleted ${r.data?.deleted ?? n} item${(r.data?.deleted ?? n) === 1 ? "" : "s"}`);
        clear();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  const allSelected = selected.size > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && selected.size < rows.length;

  return (
    <>
      {selected.size > 0 ? (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-lg border bg-accent/30 px-3 py-2 text-sm shadow-sm backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="font-medium">{selected.size} selected</span>
            <button
              type="button"
              onClick={clear}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={pending}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {pending ? "Deleting…" : "Delete selected"}
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card">
        {/* Compact select-all for tablet/phone — the desktop column header
            (which holds the select-all checkbox) is hidden below lg. */}
        <label className="flex cursor-pointer items-center gap-2 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground lg:hidden">
          <input
            type="checkbox"
            aria-label="Select all"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={toggleAll}
            className="h-4 w-4 cursor-pointer rounded border-border"
          />
          Select all
        </label>
        {/* Column header only makes sense at desktop width; below lg the rows
            self-label (app review UX — tablet tables). */}
        <div className="hidden items-center gap-3 border-b bg-muted/30 px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground lg:flex">
          <div className="flex w-5 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              aria-label="Select all"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={toggleAll}
              className="h-4 w-4 cursor-pointer rounded border-border"
            />
          </div>
          <div className="w-20 shrink-0" />
          <div className="w-64 shrink-0">Name · Code</div>
          <div className="w-32 shrink-0">Category</div>
          <div className="w-44 shrink-0 text-right">On hand</div>
          <div className="w-16 shrink-0 text-right">Reorder</div>
          <div className="w-24 shrink-0 text-right">Value</div>
          <div className="flex-1" />
        </div>
        <ul className="divide-y">
          {rows.map((r) => {
            const isSelected = selected.has(r.id);
            return (
              <li
                key={r.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                  isSelected ? "bg-accent/20" : "hover:bg-muted/40",
                )}
              >
                <div
                  className="flex w-5 shrink-0 items-center justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.name || "item"}`}
                    checked={isSelected}
                    onChange={() => toggle(r.id)}
                    className="h-4 w-4 cursor-pointer rounded border-border"
                  />
                </div>
                <Link href={`/inventory/${r.id}`} className="shrink-0">
                  <SmartImage
                    src={r.photoPath ? `/api/items/${r.id}/photo` : null}
                    alt={r.name}
                    className="h-14 w-14 rounded-md border object-cover lg:h-20 lg:w-20"
                    fallbackClassName="border-dashed"
                  />
                </Link>
                <div className="min-w-0 flex-1 lg:w-64 lg:flex-none">
                  <Link
                    href={`/inventory/${r.id}`}
                    className="block truncate font-medium text-foreground hover:underline"
                  >
                    {r.name?.trim() || (
                      <span className="italic text-muted-foreground">Untitled item</span>
                    )}
                  </Link>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground">
                      {r.code}
                    </span>
                    {r.description ? (
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {r.description}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="hidden w-32 shrink-0 truncate text-muted-foreground lg:block">
                  {r.categoryName ? (
                    <CategoryChipLink name={r.categoryName} />
                  ) : (
                    "—"
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 lg:w-44">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        r.crit
                          ? "font-medium text-destructive"
                          : r.low
                            ? "text-yellow-600"
                            : "",
                      )}
                    >
                      {r.stock} {r.unit}
                    </span>
                    {r.crit ? (
                      <Badge variant="destructive">Low</Badge>
                    ) : r.low ? (
                      <Badge variant="secondary">Warn</Badge>
                    ) : null}
                  </div>
                  {/* For pack-style items (drip pipe rolls, dripper bags etc),
                      show the total sub-unit stock below the pack count so
                      "3 rolls" reads as "= 1,500 metres" at a glance. */}
                  {r.subUnit && r.subFactor && Number(r.subFactor) > 0 ? (
                    <span className="text-[10px] text-muted-foreground">
                      = {(Number(r.stock) * Number(r.subFactor)).toFixed(0)}{" "}
                      {r.subUnit}
                    </span>
                  ) : null}
                  {r.usesRemaining !== null && r.usesMax !== null ? (
                    <span className="text-[10px] text-muted-foreground">
                      {r.usesRemaining} / {r.usesMax} uses left
                    </span>
                  ) : null}
                  {/* Value is a desktop column; keep it visible on small screens
                      under the stock figure so nothing important disappears. */}
                  <span className="text-[10px] font-medium lg:hidden">{r.valueFormatted}</span>
                </div>
                <div className="hidden w-16 shrink-0 text-right text-muted-foreground lg:block">
                  {r.reorder}
                </div>
                <div className="hidden w-24 shrink-0 text-right font-medium lg:block">
                  {r.valueFormatted}
                </div>
                <div className="hidden flex-1 lg:block" />
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

