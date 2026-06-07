"use client";

import { useQueryState } from "nuqs";
import { LayoutGrid, List, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function InventoryFilters({ categories }: { categories: string[] }) {
  const [q, setQ] = useQueryState("q", { defaultValue: "", shallow: false });
  const [cat, setCat] = useQueryState("cat", { defaultValue: "", shallow: false });
  const [sort, setSort] = useQueryState("sort", { defaultValue: "name", shallow: false });
  const [view, setView] = useQueryState("view", { defaultValue: "grid", shallow: false });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative sm:max-w-sm sm:flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search items…"
          value={q}
          onChange={(e) => setQ(e.target.value || null)}
          className="pl-9"
        />
      </div>
      <Select value={cat || "all"} onValueChange={(v) => setCat(v === "all" ? null : v)}>
        <SelectTrigger className="sm:w-52">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={sort} onValueChange={(v) => setSort(v)}>
        <SelectTrigger className="sm:w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">Name</SelectItem>
          <SelectItem value="stock">Stock level</SelectItem>
          <SelectItem value="value">Value (desc)</SelectItem>
          <SelectItem value="recent">Recent</SelectItem>
        </SelectContent>
      </Select>
      <div className="inline-flex rounded-md border bg-background p-0.5 sm:ml-auto">
        <button
          type="button"
          onClick={() => setView("grid")}
          aria-pressed={view !== "list"}
          className={cn(
            "flex h-8 w-9 items-center justify-center rounded transition-colors",
            view !== "list"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
          aria-label="Grid view"
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setView("list")}
          aria-pressed={view === "list"}
          className={cn(
            "flex h-8 w-9 items-center justify-center rounded transition-colors",
            view === "list"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
          aria-label="List view"
        >
          <List className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
