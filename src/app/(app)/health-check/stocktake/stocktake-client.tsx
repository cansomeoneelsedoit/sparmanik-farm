"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, ListChecks, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  StocktakeRow,
  type StocktakeItem,
} from "@/app/(app)/health-check/stocktake/stocktake-row";

/**
 * Client wrapper for the stock-take wizard. Owns the search filter and
 * orders un-counted items first so the user works the queue top-to-bottom.
 *
 * Two view modes:
 *   - "Needs counting" (default): items where pack info is missing OR the
 *     wizard hasn't recorded a stock-take yet. The hottest queue.
 *   - "All items": everything, including ones already done — useful for
 *     re-counting after harvest.
 */
export function StocktakeClient({
  items,
  categories,
  initialFocus,
}: {
  items: StocktakeItem[];
  categories: { id: string; name: string }[];
  /** "packinfo" (from the Health Check card) starts the wizard filtered
   *  to items that still have no pack size set. */
  initialFocus?: "packinfo" | null;
}) {
  const t = useTranslations("stocktake");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showCounted, setShowCounted] = useState(false);
  const [packOnly, setPackOnly] = useState(initialFocus === "packinfo");

  const packCandidateCount = useMemo(
    () => items.filter((i) => i.packCandidate).length,
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      // Pack-info mode ignores the counted/un-counted split: an item can be
      // counted yet still missing its pack size.
      .filter((i) => (packOnly ? i.packCandidate : showCounted ? true : !i.done))
      .filter((i) => !categoryFilter || i.categoryId === categoryFilter)
      .filter((i) => {
        if (!q) return true;
        return (
          i.name.toLowerCase().includes(q) ||
          i.code.toLowerCase().includes(q) ||
          (i.unit ?? "").toLowerCase().includes(q) ||
          (i.subUnit ?? "").toLowerCase().includes(q)
        );
      });
  }, [items, search, showCounted, categoryFilter, packOnly]);

  // Push counted items to the bottom so the queue is "what to do next" first.
  const ordered = useMemo(
    () => [...filtered].sort((a, b) => Number(a.done) - Number(b.done)),
    [filtered],
  );

  const doneCount = items.filter((i) => i.done).length;
  const totalCount = items.length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Button asChild size="sm" variant="ghost" className="-ml-2 h-7">
              <Link href="/health-check">
                <ArrowLeft className="h-3.5 w-3.5" /> {t("backToHealthCheck")}
              </Link>
            </Button>
          </div>
          <h1 className="font-serif text-3xl">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
          <ListChecks className="h-6 w-6 text-muted-foreground" />
          <div className="text-xs text-muted-foreground">
            <div className="text-2xl font-semibold tabular-nums text-foreground">
              {doneCount}/{totalCount}
            </div>
            {t("countedSoFar")}
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-9"
          />
        </div>
        {/* Categories wrap to as many rows as needed — the original cap at
            5 hid most of the warehouse on any farm with > 5 buckets. With
            wrap + max-h, even an org with 30 categories stays scannable. */}
        <div className="flex max-h-32 flex-wrap items-center gap-2 overflow-y-auto">
          <Button
            type="button"
            size="sm"
            variant={categoryFilter === null ? "default" : "outline"}
            onClick={() => setCategoryFilter(null)}
          >
            {t("allCategories")}
          </Button>
          {categories.map((c) => (
            <Button
              key={c.id}
              type="button"
              size="sm"
              variant={categoryFilter === c.id ? "default" : "outline"}
              onClick={() => setCategoryFilter(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={packOnly}
            onChange={(e) => setPackOnly(e.target.checked)}
            className="h-4 w-4"
          />
          {t("packOnly", { count: packCandidateCount })}
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showCounted}
            onChange={(e) => setShowCounted(e.target.checked)}
            className="h-4 w-4"
          />
          {t("showCounted", { count: doneCount })}
        </label>
      </div>

      {ordered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
          {showCounted
            ? t("noMatches")
            : doneCount === totalCount
              ? t("allCounted")
              : t("noMatches")}
        </div>
      ) : (
        <div className="space-y-2">
          {ordered.map((i, idx) => (
            <StocktakeRow
              key={i.id}
              item={i}
              autoOpenNextId={ordered[idx + 1]?.id ?? null}
            />
          ))}
        </div>
      )}

      <Badge
        variant="outline"
        className={cn(
          "fixed bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 text-xs shadow-md",
          ordered.length === 0 && "hidden",
        )}
      >
        {t("showingOf", { shown: ordered.length, total: items.length })}
      </Badge>
    </div>
  );
}
