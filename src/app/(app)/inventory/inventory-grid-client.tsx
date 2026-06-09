"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, CheckSquare, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SmartImage } from "@/components/shared/smart-image";
import { CategoryChipLink } from "@/app/(app)/inventory/category-chip-link";
import { deleteItems } from "@/app/(app)/inventory/actions";

export type GridRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  photoPath: string | null;
  unit: string;
  subUnit: string | null;
  subFactor: string | null;
  reorderStr: string;
  stockStr: string;
  /** Pre-formatted (e.g. "Rp 12,345") by the server page so this client
   *  file doesn't have to import @/components/shared/money. Importing
   *  `<Money>` into a "use client" file pulls @/server/prisma into the
   *  client bundle and Turbopack errors with "chunking context does not
   *  support external modules" — see CLAUDE.md gotcha #18. */
  valueFormatted: string;
  categoryName: string | null;
  usesRemaining: number | null;
  usesMax: number | null;
  low: boolean;
  crit: boolean;
};

/**
 * Grid view with optional bulk-select mode. Default behavior is identical
 * to the original static grid (each card is a Link to /inventory/[id]).
 * Toggle "Select" in the toolbar to swap cards from navigation into a
 * multi-checkbox layout — the same flow the list view supports — so the
 * user can bulk-delete from grid mode too.
 */
export function InventoryGridClient({ rows }: { rows: GridRow[] }) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startT] = useTransition();
  const router = useRouter();

  function toggleOne(id: string) {
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

  function exitSelect() {
    setSelectMode(false);
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
    startT(async () => {
      const r = await deleteItems(ids);
      if (r.ok) {
        toast.success(`Deleted ${r.data?.deleted ?? n} item${(r.data?.deleted ?? n) === 1 ? "" : "s"}`);
        exitSelect();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  const allSelected = selected.size > 0 && selected.size === rows.length;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        {selectMode ? (
          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={toggleAll}
              className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
            <span className="text-muted-foreground">
              <strong className="text-foreground">{selected.size}</strong> selected
            </span>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            {rows.length} item{rows.length === 1 ? "" : "s"} shown
          </div>
        )}
        <div className="flex gap-2">
          {selectMode ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={exitSelect}
                disabled={pending}
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDelete}
                disabled={pending || selected.size === 0}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {pending ? "Deleting…" : `Delete ${selected.size || ""}`}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setSelectMode(true)}>
              <CheckSquare className="h-3.5 w-3.5" /> Select
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {rows.map((r) => {
          const isSel = selected.has(r.id);
          const Card = (
            <div
              className={cn(
                "group block overflow-hidden rounded-xl border bg-card transition-all",
                selectMode
                  ? isSel
                    ? "ring-2 ring-accent"
                    : "hover:border-foreground/30"
                  : "hover:-translate-y-0.5 hover:shadow-lg",
              )}
            >
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                <SmartImage
                  src={r.photoPath ? `/api/items/${r.id}/photo` : null}
                  alt={r.name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {selectMode ? (
                  <div className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-background/90 shadow">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => {}}
                      readOnly
                      className="h-4 w-4"
                      aria-label={`Select ${r.name}`}
                    />
                  </div>
                ) : null}
                {r.crit ? (
                  <Badge variant="destructive" className="absolute right-2 top-2">
                    Low
                  </Badge>
                ) : r.low ? (
                  <Badge variant="secondary" className="absolute right-2 top-2">
                    Warn
                  </Badge>
                ) : null}
              </div>
              <div className="space-y-1.5 p-3">
                <div className="line-clamp-1 text-sm font-medium">
                  {r.name?.trim() || (
                    <span className="italic text-muted-foreground">Untitled item</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground">
                    {r.code}
                  </span>
                  {r.categoryName ? <CategoryChipLink name={r.categoryName} /> : null}
                </div>
                {r.description ? (
                  <div className="line-clamp-2 text-xs text-muted-foreground">
                    {r.description}
                  </div>
                ) : null}
                <div className="flex items-center justify-between pt-1.5">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      r.crit
                        ? "text-destructive"
                        : r.low
                          ? "text-yellow-600"
                          : "text-muted-foreground",
                    )}
                  >
                    {r.stockStr} {r.unit}
                    {r.subUnit && r.subFactor && Number(r.subFactor) > 0 ? (
                      <span className="ml-1 text-[10px] text-muted-foreground/80">
                        ({(Number(r.stockStr) * Number(r.subFactor)).toFixed(0)} {r.subUnit})
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs font-semibold">{r.valueFormatted}</span>
                </div>
                {r.usesRemaining !== null && r.usesMax !== null ? (
                  <div className="rounded bg-muted/50 px-2 py-0.5 text-center text-[10px] text-muted-foreground">
                    {r.usesRemaining} / {r.usesMax} uses left
                  </div>
                ) : null}
              </div>
            </div>
          );
          return selectMode ? (
            <button
              key={r.id}
              type="button"
              onClick={() => toggleOne(r.id)}
              className="text-left"
            >
              {Card}
            </button>
          ) : (
            <Link key={r.id} href={`/inventory/${r.id}`} className="block">
              {Card}
            </Link>
          );
        })}
      </div>
    </>
  );
}
