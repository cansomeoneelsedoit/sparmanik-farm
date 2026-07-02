"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";

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
  emptyHint,
  // Show the search input as soon as there's more than a handful of options
  // — typing two or three letters should always filter, never hunt-and-peck.
  searchThreshold = 3,
  className,
  onCreate,
  createLabel,
}: {
  options: ComboboxOption[];
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyHint?: string;
  searchThreshold?: number;
  className?: string;
  /**
   * When provided, the dropdown shows a "+ Create '<query>'" affordance at
   * the bottom whenever the typed query doesn't exactly match any option.
   * The handler receives the typed label; it should create the entity, then
   * the parent updates `options` and `value` so the new row is selected.
   */
  onCreate?: (label: string) => void | Promise<void>;
  createLabel?: (typed: string) => string;
}) {
  // Localized defaults so every picker in the app follows the EN/ID toggle —
  // the hardcoded English "Type to search…" / "No matches." / "Create …" leaked
  // into otherwise fully translated staff dialogs (app review follow-up).
  const t = useTranslations("combobox");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Always show the search box when ad-hoc create is enabled, even with few/no
  // options — otherwise you can't type the name of the first item to create it.
  const showSearch = options.length >= searchThreshold || !!onCreate;
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
          // Matches Input + SelectTrigger so all three controls have the
          // same height, padding, background and border treatment — the
          // earlier `h-9 bg-transparent shadow-xs` made the Combobox look
          // visibly different inside a Dialog, which read as a "broken
          // border" bug.
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !selected && "text-muted-foreground",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{selected ? selected.label : placeholder}</span>
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
                placeholder={t("search")}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          ) : null}
          <div className="max-h-60 overflow-y-auto p-1">
            {(() => {
              const trimmed = query.trim();
              const exactMatch =
                trimmed !== "" &&
                filtered.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());
              const showCreate = !!onCreate && trimmed !== "" && !exactMatch;
              if (filtered.length === 0 && !showCreate) {
                return <div className="px-3 py-2 text-xs text-muted-foreground">{emptyHint ?? t("noMatches")}</div>;
              }
              return (
                <>
                  {filtered.map((o) => {
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
              })}
              {showCreate ? (
                <button
                  type="button"
                  onClick={async () => {
                    const label = trimmed;
                    setOpen(false);
                    setQuery("");
                    await onCreate?.(label);
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded-sm border-t px-2 py-1.5 text-left text-sm text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate">
                    {createLabel ? createLabel(trimmed) : t("create", { name: trimmed })}
                  </span>
                </button>
              ) : null}
                </>
              );
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
