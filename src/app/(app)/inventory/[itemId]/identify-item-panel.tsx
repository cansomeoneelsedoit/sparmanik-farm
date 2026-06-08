"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Save, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  suggestItemIdentity,
  acceptItemIdentity,
} from "@/app/(app)/inventory/actions";

/**
 * Top-of-page banner shown only when the item's name is blank. Surfaces the
 * strongest clues already visible elsewhere on the page (supplier, category,
 * recent batch) plus an "AI guess" button that pings the chain with rich
 * context (supplier history, harvest usage, install history, prices).
 *
 * The suggestion lands in editable fields so the user can tweak before
 * saving. Save uses acceptItemIdentity which only touches name + description
 * — no risk of stomping the user's other fields.
 */
export function IdentifyItemPanel({
  itemId,
  code,
  unit,
  categoryName,
  defaultSupplierName,
  topSupplierName,
  lastReceivedDate,
  lastPaidLabel,
  batchCount,
  installCount,
}: {
  itemId: string;
  code: string;
  unit: string;
  categoryName: string | null;
  defaultSupplierName: string | null;
  /** Most-recent supplier seen on the batches list. May differ from
   *  defaultSupplier. Surfaced because it's usually the strongest clue. */
  topSupplierName: string | null;
  lastReceivedDate: string | null;
  /** Pre-formatted "Rp 12,345" string from the server (client doesn't
   *  import @/components/shared/money — see CLAUDE.md gotcha #18). */
  lastPaidLabel: string | null;
  batchCount: number;
  installCount: number;
}) {
  const [pending, startT] = useTransition();
  const [suggestion, setSuggestion] = useState<{
    name: string;
    description: string;
    confidence: "Strong" | "Plausible" | "Weak";
    reason: string;
  } | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const router = useRouter();

  function runSuggest() {
    startT(async () => {
      const r = await suggestItemIdentity({ itemId });
      if (r.ok && r.data) {
        setSuggestion(r.data);
        setEditName(r.data.name);
        setEditDesc(r.data.description);
      } else if (!r.ok) {
        toast.error(r.error);
      }
    });
  }

  function dismiss() {
    setSuggestion(null);
    setEditName("");
    setEditDesc("");
  }

  function save() {
    if (!editName.trim()) {
      toast.error("Name can't be empty");
      return;
    }
    startT(async () => {
      const r = await acceptItemIdentity({
        itemId,
        name: editName.trim(),
        description: editDesc.trim() || undefined,
      });
      if (r.ok && r.data) {
        toast.success(`Saved as "${r.data.name}"`);
        router.refresh();
      } else if (!r.ok) {
        toast.error(r.error);
      }
    });
  }

  // No clues at all? Tell the user explicitly so they're not staring at
  // an empty panel wondering why the button does nothing.
  const haveAnyClue =
    !!categoryName ||
    !!defaultSupplierName ||
    !!topSupplierName ||
    batchCount > 0 ||
    installCount > 0;

  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-4 dark:border-amber-700/40 dark:bg-amber-950/30">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-200/60 text-amber-700 dark:bg-amber-700/30 dark:text-amber-300">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              This item doesn&rsquo;t have a name yet
            </div>
            <p className="text-xs text-amber-800/80 dark:text-amber-200/70">
              Item code <strong>{code}</strong> was imported without a name.
              Use the clues below or let the AI guess from supplier &amp;
              purchase history.
            </p>
          </div>

          {/* Clues row — pulls every visible signal so the user can answer
              themselves if they recognise it. */}
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {categoryName ? (
              <Badge variant="outline" className="bg-background">
                Category: <strong className="ml-1 text-foreground">{categoryName}</strong>
              </Badge>
            ) : null}
            {(topSupplierName ?? defaultSupplierName) ? (
              <Badge variant="outline" className="bg-background">
                Supplier:{" "}
                <strong className="ml-1 text-foreground">
                  {topSupplierName ?? defaultSupplierName}
                </strong>
              </Badge>
            ) : null}
            {lastPaidLabel ? (
              <Badge variant="outline" className="bg-background">
                Last paid:{" "}
                <strong className="ml-1 text-foreground">{lastPaidLabel}</strong>{" "}
                / {unit}
              </Badge>
            ) : null}
            {lastReceivedDate ? (
              <Badge variant="outline" className="bg-background">
                Last received:{" "}
                <strong className="ml-1 text-foreground">{lastReceivedDate}</strong>
              </Badge>
            ) : null}
            {batchCount > 0 ? (
              <Badge variant="outline" className="bg-background">
                <strong className="text-foreground">{batchCount}</strong>{" "}
                batch{batchCount === 1 ? "" : "es"} on file
              </Badge>
            ) : null}
            {installCount > 0 ? (
              <Badge variant="outline" className="bg-background">
                Installed on <strong className="text-foreground">{installCount}</strong>{" "}
                greenhouse{installCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {!haveAnyClue ? (
              <Badge variant="outline" className="bg-background text-muted-foreground">
                No purchase / usage history yet
              </Badge>
            ) : null}
          </div>

          {suggestion ? (
            <div className="space-y-3 rounded-md border bg-background p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-accent-foreground" />
                <span>AI suggestion</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    suggestion.confidence === "Strong" &&
                      "border-emerald-500/40 bg-emerald-500/10",
                    suggestion.confidence === "Weak" &&
                      "border-rose-500/40 bg-rose-500/10",
                  )}
                >
                  {suggestion.confidence}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">Suggested name</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Name"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Suggested description</Label>
                  <Textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={2}
                    placeholder="Optional description"
                  />
                </div>
              </div>
              {suggestion.reason ? (
                <p className="text-[11px] text-muted-foreground">
                  <strong>Why:</strong> {suggestion.reason}
                </p>
              ) : null}
              <div className="flex items-center justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={dismiss} disabled={pending}>
                  <X className="h-3.5 w-3.5" /> Dismiss
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runSuggest}
                  disabled={pending}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Try again
                </Button>
                <Button size="sm" onClick={save} disabled={pending || !editName.trim()}>
                  <Save className="h-3.5 w-3.5" />
                  {pending ? "Saving…" : "Save name & description"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={runSuggest}
                disabled={pending || !haveAnyClue}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {pending ? "Asking the AI…" : "AI: guess what this is"}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Uses the supplier, prices, and any harvest install/usage
                history to make a best guess.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
