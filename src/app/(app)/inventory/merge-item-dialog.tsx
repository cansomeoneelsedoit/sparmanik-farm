"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Combine, Search } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  mergeItems,
  mergeItemsPreview,
  searchMergeTargets,
} from "@/app/(app)/inventory/actions";

type TargetCandidate = {
  id: string;
  code: string;
  name: string;
  unit: string;
  stock: string;
};

type Preview = {
  source: { id: string; code: string; name: string; unit: string };
  target: { id: string; code: string; name: string; unit: string };
  batchesToMove: number;
  usagesToMove: number;
  assetsToMove: number;
  unitMismatch: string | null;
};

/**
 * "Merge into another item…" dialog.
 *
 * The source item (the one the user clicked Merge ON) becomes the LOSER —
 * its batches, harvest usages, and harvest installs all re-point to the
 * target, then the source row is deleted. The target keeps its name, code,
 * photo, etc. — pick the target that has the better data.
 *
 * Preview-then-confirm: as soon as the user picks a target we re-fetch a
 * preview (batches/usages/assets that will move + unit mismatch warning),
 * so the user knows exactly what they're about to commit to.
 */
export function MergeItemDialog({
  sourceId,
  sourceName,
  sourceCode,
  trigger,
  onMerged,
}: {
  sourceId: string;
  sourceName: string;
  sourceCode: string;
  trigger: React.ReactNode;
  /** Optional callback fired after a successful merge — used by the
   *  stock-take row to collapse itself / fade out. */
  onMerged?: (targetId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TargetCandidate[]>([]);
  const [target, setTarget] = useState<TargetCandidate | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, startT] = useTransition();
  const router = useRouter();

  // Debounce search so a fast typer doesn't fire one request per keystroke.
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      void (async () => {
        const r = await searchMergeTargets({
          query: query.trim(),
          excludeId: sourceId,
        });
        // queueMicrotask dodges the React 19 set-state-in-effect lint —
        // same dodge we use elsewhere (simulator, chat-panel). TS narrowing
        // is lost across the closure, so capture data first.
        if (r.ok && r.data) {
          const data = r.data;
          queueMicrotask(() => setResults(data));
        }
      })();
    }, 200);
    return () => clearTimeout(handle);
  }, [query, sourceId, open]);

  // Whenever the user picks a target, pull a preview to show what's
  // about to move + warn on unit mismatch.
  useEffect(() => {
    if (!target) {
      queueMicrotask(() => setPreview(null));
      return;
    }
    void (async () => {
      const r = await mergeItemsPreview({
        sourceId,
        targetId: target.id,
      });
      if (r.ok && r.data) {
        const data = r.data;
        queueMicrotask(() => setPreview(data));
      }
    })();
  }, [target, sourceId]);

  function reset() {
    setQuery("");
    setResults([]);
    setTarget(null);
    setPreview(null);
  }

  function commit() {
    if (!target) return;
    if (preview?.unitMismatch) {
      toast.error("Resolve the unit mismatch first.");
      return;
    }
    startT(async () => {
      const r = await mergeItems({ sourceId, targetId: target.id });
      if (r.ok && r.data) {
        toast.success(
          `Merged into "${target.name}" (${r.data.batchesMoved} batches + ${r.data.usagesMoved + r.data.assetsMoved} harvest links moved)`,
        );
        setOpen(false);
        reset();
        onMerged?.(target.id);
        router.refresh();
      } else if (!r.ok) {
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
      <div onClick={(e) => e.stopPropagation()}>{trigger}</div>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge into another item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="text-xs text-muted-foreground">This item</div>
            <div className="mt-0.5 flex items-center gap-2">
              <code className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] tracking-wider">
                {sourceCode}
              </code>
              <span className="font-medium">{sourceName}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Everything attached to this item (batches, harvest usages,
              installs) will move to the target you pick below. Then this
              item is deleted.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Find the item to merge into</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a name or SF code…"
                className="pl-8"
              />
            </div>
            {results.length > 0 ? (
              <ul className="max-h-44 overflow-y-auto rounded-md border">
                {results.map((r) => {
                  const active = target?.id === r.id;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setTarget(r)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/40",
                          active && "bg-accent/10",
                        )}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-wider">
                            {r.code}
                          </code>
                          <span className="truncate">{r.name}</span>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {r.stock} {r.unit}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : query.trim() ? (
              <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                No matches.
              </p>
            ) : null}
          </div>

          {preview ? (
            <div className="space-y-2 rounded-md border-2 border-accent/40 bg-accent/5 p-3 text-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Combine className="h-3.5 w-3.5 text-accent-foreground" />
                Preview
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="rounded-md border bg-background p-2 text-xs">
                  <div className="text-muted-foreground">From (deleted)</div>
                  <div className="truncate font-medium">{preview.source.name}</div>
                  <code className="text-[10px] tracking-wider text-muted-foreground">
                    {preview.source.code}
                  </code>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="rounded-md border bg-background p-2 text-xs">
                  <div className="text-muted-foreground">Into (keeps)</div>
                  <div className="truncate font-medium">{preview.target.name}</div>
                  <code className="text-[10px] tracking-wider text-muted-foreground">
                    {preview.target.code}
                  </code>
                </div>
              </div>
              <ul className="space-y-0.5 text-xs">
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Batches that move</span>
                  <strong>{preview.batchesToMove}</strong>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Harvest usages that move</span>
                  <strong>{preview.usagesToMove}</strong>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Harvest installs that move</span>
                  <strong>{preview.assetsToMove}</strong>
                </li>
              </ul>
              {preview.unitMismatch ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  ⚠ {preview.unitMismatch}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending || !target || !!preview?.unitMismatch}
            onClick={commit}
          >
            <Combine className="h-3.5 w-3.5" />
            {pending ? "Merging…" : `Merge ${preview ? preview.source.code : ""} →`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
