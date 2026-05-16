"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";

export type ComboboxOption = { value: string; label: string; description?: string };

/**
 * Searchable single-select. Falls back to a plain dropdown when there are
 * fewer than `searchThreshold` options; otherwise renders a filter input
 * above the list so the user can type-to-search.
 *
 * The popover is rendered with `z-[100]` to stay above any open `<Dialog>`
 * (same z-index pattern as the shadcn Select primitive in this app).
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  disabled = false,
  emptyHint = "No matches.",
  searchThreshold = 5,
  className,
}: {
  options: ComboboxOption[];
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyHint?: string;
  searchThreshold?: number;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const showSearch = options.length >= searchThreshold;
  const selected = options.find((o) => o.value === value);

  const filtered = React.useMemo(() => {
    if (!showSearch || query.trim() === "") return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query, showSearch]);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    if (showSearch) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => {
        clearTimeout(t);
        document.removeEventListener("mousedown", onDocClick);
        document.removeEventListener("keydown", onKey);
      };
    }
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, showSearch]);

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !selected && "text-muted-foreground",
        )}
      >
        <span className="truncate text-left">{selected ? selected.label : placeholder}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-[100] mt-1 max-h-72 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          {showSearch ? (
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type to search…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          ) : null}
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">{emptyHint}</div>
            ) : (
              filtered.map((o) => {
                const active = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent/10",
                      active && "bg-accent/10",
                    )}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1">
                      <span className="block truncate">{o.label}</span>
                      {o.description ? (
                        <span className="block truncate text-xs text-muted-foreground">{o.description}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
