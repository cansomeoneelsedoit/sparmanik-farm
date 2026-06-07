"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Grid3x3, List, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LocalizedTextClient as LocalizedText } from "@/components/shared/localized-text-client";
import { cn } from "@/lib/utils";

export type SopRow = {
  id: string;
  titleEn: string;
  titleId: string;
  category: string | null;
  status: "ACTIVE" | "ARCHIVED";
  updatedAt: string; // ISO YYYY-MM-DD
};

/**
 * Searchable, category-filterable browser shared by the SOPs page.
 * - List vs grid toggle (defaults to grid)
 * - Search across titles + category
 * - Category quick-filter chips at the top, click to AND with search
 */
export function SopsBrowser({ sops }: { sops: SopRow[] }) {
  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const x of sops) if (x.category) s.add(x.category);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [sops]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sops.filter((s) => {
      if (activeCat && s.category !== activeCat) return false;
      if (!needle) return true;
      return (
        s.titleEn.toLowerCase().includes(needle) ||
        s.titleId.toLowerCase().includes(needle) ||
        (s.category ?? "").toLowerCase().includes(needle)
      );
    });
  }, [sops, q, activeCat]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search SOPs by title or category…"
            className="pl-8"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
        <div className="flex rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => setView("grid")}
            className={cn(
              "rounded-sm px-2 py-1 text-xs",
              view === "grid"
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60",
            )}
            title="Grid view"
          >
            <Grid3x3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={cn(
              "rounded-sm px-2 py-1 text-xs",
              view === "list"
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60",
            )}
            title="List view"
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {categories.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveCat(null)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition",
              activeCat === null
                ? "border-accent bg-accent/15 text-foreground"
                : "border-border bg-background text-muted-foreground hover:border-accent/60",
            )}
          >
            All ({sops.length})
          </button>
          {categories.map((c) => {
            const n = sops.filter((s) => s.category === c).length;
            const on = activeCat === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setActiveCat(on ? null : c)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition",
                  on
                    ? "border-accent bg-accent/15 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-accent/60",
                )}
              >
                {c} ({n})
              </button>
            );
          })}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            {sops.length === 0 ? "No SOPs in this filter." : "No SOPs match your search."}
          </CardContent>
        </Card>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <Link key={s.id} href={`/sops/${s.id}`}>
              <Card className="cursor-pointer transition hover:shadow-md">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-serif">
                      <LocalizedText en={s.titleEn} id={s.titleId} />
                    </CardTitle>
                    <Badge variant={s.status === "ACTIVE" ? "accent" : "secondary"}>{s.status}</Badge>
                  </div>
                  {s.category ? (
                    <div className="text-xs text-muted-foreground">{s.category}</div>
                  ) : null}
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Updated {s.updatedAt}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {filtered.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/sops/${s.id}`}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        <LocalizedText en={s.titleEn} id={s.titleId} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.category ? `${s.category} · ` : ""}Updated {s.updatedAt}
                      </div>
                    </div>
                    <Badge variant={s.status === "ACTIVE" ? "accent" : "secondary"} className="shrink-0">
                      {s.status}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-muted-foreground">
        Showing {filtered.length} of {sops.length}
      </div>
    </div>
  );
}

export { Button };
