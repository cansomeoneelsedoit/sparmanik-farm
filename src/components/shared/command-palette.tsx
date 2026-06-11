"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calculator,
  Camera,
  ClipboardList,
  DollarSign,
  HeartPulse,
  LayoutDashboard,
  Leaf,
  ListChecks,
  Package,
  PackagePlus,
  Search,
  Settings,
  Sparkles,
  Truck,
  UserCircle2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { globalSearch, type SearchHit } from "@/server/search-actions";

/** Custom event name the topbar's search button dispatches. */
export const OPEN_SEARCH_EVENT = "sf:open-search";

type PageEntry = {
  href: string;
  label: string;
  detail: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  /** Extra words the filter should match ("count" → Stock-take). */
  keywords?: string;
};

/** Static navigation + action entries — filtered client-side, no fetch. */
const PAGES: PageEntry[] = [
  { href: "/", label: "Dashboard", detail: "KPIs, alerts, sales pulse", icon: LayoutDashboard },
  { href: "/harvest", label: "Greenhouses", detail: "Cycles, P&L, installs", icon: Leaf },
  { href: "/inventory", label: "Inventory", detail: "All stock items", icon: Package },
  { href: "/inventory/receive", label: "Receive stock", detail: "Log a delivery", icon: PackagePlus, keywords: "delivery purchase buy" },
  { href: "/health-check/stocktake", label: "Stock-take", detail: "Count the shelves", icon: ListChecks, keywords: "count audit warehouse" },
  { href: "/inventory/identify", label: "Identify item", detail: "Snap a photo, find it", icon: Camera, keywords: "photo camera ai" },
  { href: "/simulator", label: "Simulator", detail: "What-if cycle P&L", icon: Calculator, keywords: "test profit scenario" },
  { href: "/sales", label: "Sales", detail: "Revenue & filters", icon: DollarSign },
  { href: "/expenses", label: "Expenses", detail: "Misc costs, receipts", icon: DollarSign, keywords: "receipt contractor cash" },
  { href: "/financials", label: "Total Business Financials", detail: "The bottom line", icon: DollarSign, keywords: "profit loss pl net" },
  { href: "/suppliers", label: "Suppliers", detail: "Who we buy from", icon: Truck },
  { href: "/staff", label: "Staff", detail: "People & rates", icon: UserCircle2 },
  { href: "/tasks", label: "Tasks", detail: "To-dos & assignments", icon: ClipboardList },
  { href: "/health-check", label: "Health check", detail: "Data hygiene & fixes", icon: HeartPulse },
  { href: "/settings", label: "Settings", detail: "Categories, produce, keys…", icon: Settings },
  { href: "/ask-ai", label: "Ask AI", detail: "Chat with the farm brain", icon: Sparkles, keywords: "chat claude gemini" },
];

type Row =
  | { kind: "header"; label: string }
  | { kind: "page"; entry: PageEntry }
  | { kind: "hit"; hit: SearchHit };

/**
 * Global command palette. Open with Ctrl/Cmd+K anywhere, or the search
 * button in the topbar. Type to jump to a page or fuzzy-find items,
 * greenhouses, suppliers and staff by name — one box that gets you
 * anywhere in two keystrokes and an Enter.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Hotkey + topbar-button event. Listeners only — no synchronous
  // setState inside the effect body itself.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpenEvent);
    };
  }, []);

  // Debounced entity search. queueMicrotask dodges the React 19
  // set-state-in-effect lint (CLAUDE.md gotcha #23).
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      queueMicrotask(() => {
        setHits([]);
        setSearching(false);
      });
      return;
    }
    queueMicrotask(() => setSearching(true));
    const handle = setTimeout(() => {
      void (async () => {
        try {
          const result = await globalSearch(q);
          queueMicrotask(() => {
            setHits(result);
            setSearching(false);
          });
        } catch {
          queueMicrotask(() => setSearching(false));
        }
      })();
    }, 180);
    return () => clearTimeout(handle);
  }, [query, open]);

  // Build the flat, keyboard-navigable row list: matching pages first
  // (instant), then server hits grouped by entity type.
  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const pageMatches = PAGES.filter((p) => {
      if (!q) return true;
      return (
        p.label.toLowerCase().includes(q) ||
        p.detail.toLowerCase().includes(q) ||
        (p.keywords ?? "").includes(q)
      );
    });
    const out: Row[] = [];
    if (pageMatches.length > 0) {
      out.push({ kind: "header", label: "Go to" });
      for (const entry of pageMatches.slice(0, q ? 6 : 8)) {
        out.push({ kind: "page", entry });
      }
    }
    let lastGroup: string | null = null;
    for (const hit of hits) {
      if (hit.group !== lastGroup) {
        out.push({ kind: "header", label: hit.group });
        lastGroup = hit.group;
      }
      out.push({ kind: "hit", hit });
    }
    return out;
  }, [query, hits]);

  /** Indices of selectable (non-header) rows, in display order. */
  const selectable = useMemo(
    () => rows.map((r, i) => ({ r, i })).filter((x) => x.r.kind !== "header").map((x) => x.i),
    [rows],
  );

  // Clamp selection when the result set changes.
  useEffect(() => {
    queueMicrotask(() => setSelected(0));
  }, [query, hits.length]);

  function close() {
    setOpen(false);
    setQuery("");
    setHits([]);
    setSelected(0);
  }

  function navigateTo(href: string) {
    close();
    router.push(href);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (selectable.length === 0) return;
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const next = (selected + dir + selectable.length) % selectable.length;
      setSelected(next);
      // Keep the highlighted row in view as the user arrows through.
      const el = listRef.current?.querySelector(`[data-row-index="${next}"]`);
      el?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const rowIdx = selectable[selected];
      if (rowIdx === undefined) return;
      const row = rows[rowIdx];
      if (row.kind === "page") navigateTo(row.entry.href);
      else if (row.kind === "hit") navigateTo(row.hit.href);
    }
  }

  // Map flat row index → position among selectable rows (for highlight).
  const selectedRowIndex = selectable[selected];

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent
        className="top-[15%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Search the farm</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search items, greenhouses, suppliers… or jump to a page"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
            esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto p-2">
          {rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {searching ? "Searching…" : "No matches. Try an item name or SF code."}
            </p>
          ) : (
            rows.map((row, i) => {
              if (row.kind === "header") {
                return (
                  <div
                    key={`h-${row.label}-${i}`}
                    className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {row.label}
                  </div>
                );
              }
              const isSelected = i === selectedRowIndex;
              if (row.kind === "page") {
                const Icon = row.entry.icon;
                return (
                  <button
                    key={`p-${row.entry.href}`}
                    type="button"
                    data-row-index={i}
                    onClick={() => navigateTo(row.entry.href)}
                    onMouseEnter={() => setSelected(selectable.indexOf(i))}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm",
                      isSelected ? "bg-accent/15" : "hover:bg-muted/60",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate font-medium">{row.entry.label}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {row.entry.detail}
                    </span>
                  </button>
                );
              }
              return (
                <button
                  key={`e-${row.hit.href}-${i}`}
                  type="button"
                  data-row-index={i}
                  onClick={() => navigateTo(row.hit.href)}
                  onMouseEnter={() => setSelected(selectable.indexOf(i))}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm",
                    isSelected ? "bg-accent/15" : "hover:bg-muted/60",
                  )}
                >
                  <span className="flex-1 truncate">{row.hit.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {row.hit.detail}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2 text-[10px] text-muted-foreground">
          <span>↑↓ navigate · Enter open · Esc close</span>
          <span>Ctrl+K anywhere</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
