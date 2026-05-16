"use client";

import { useQueryState } from "nuqs";

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

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Input
        placeholder="Search items…"
        value={q}
        onChange={(e) => setQ(e.target.value || null)}
        className="sm:max-w-sm"
      />
      <Select value={cat || "all"} onValueChange={(v) => setCat(v === "all" ? null : v)}>
        <SelectTrigger className="sm:w-56">
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
        <SelectTrigger className="sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">Name</SelectItem>
          <SelectItem value="stock">Stock level</SelectItem>
          <SelectItem value="value">Value (desc)</SelectItem>
          <SelectItem value="recent">Recent</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
