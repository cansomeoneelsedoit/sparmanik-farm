"use client";

import { useQueryState } from "nuqs";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type GreenhouseOpt = { id: string; name: string };
export type HarvestOpt = { id: string; name: string; greenhouseId: string };

export function SalesFilters({
  greenhouses,
  harvests,
}: {
  greenhouses: GreenhouseOpt[];
  harvests: HarvestOpt[];
}) {
  const [q, setQ] = useQueryState("q", { defaultValue: "", shallow: false });
  const [gh, setGh] = useQueryState("gh", { defaultValue: "", shallow: false });
  const [hv, setHv] = useQueryState("hv", { defaultValue: "", shallow: false });
  const [from, setFrom] = useQueryState("from", { defaultValue: "", shallow: false });
  const [to, setTo] = useQueryState("to", { defaultValue: "", shallow: false });

  // When a greenhouse is picked, narrow the harvest list to only its harvests
  // so the user can't accidentally pick a harvest from a different house.
  const filteredHarvests = gh
    ? harvests.filter((h) => h.greenhouseId === gh)
    : harvests;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative min-w-[200px] flex-1">
        <label className="mb-1 block text-xs text-muted-foreground">Search</label>
        <Search className="pointer-events-none absolute left-3 top-[calc(50%+8px)] h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value || null)}
          placeholder="Buyer, note, produce…"
          className="pl-9"
        />
      </div>
      <div className="min-w-[180px]">
        <label className="mb-1 block text-xs text-muted-foreground">Greenhouse</label>
        <Select
          value={gh || "all"}
          onValueChange={(v) => {
            setGh(v === "all" ? null : v);
            // Clear harvest picker when switching houses
            if (v !== "all" && hv) {
              const stillValid = harvests.find((h) => h.id === hv)?.greenhouseId === v;
              if (!stillValid) setHv(null);
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="All greenhouses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All greenhouses</SelectItem>
            {greenhouses.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-[200px]">
        <label className="mb-1 block text-xs text-muted-foreground">Harvest</label>
        <Select
          value={hv || "all"}
          onValueChange={(v) => setHv(v === "all" ? null : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All harvests" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All harvests</SelectItem>
            {filteredHarvests.map((h) => (
              <SelectItem key={h.id} value={h.id}>
                {h.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">From</label>
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value || null)}
          className="w-[150px]"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">To</label>
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value || null)}
          className="w-[150px]"
        />
      </div>
      {q || gh || hv || from || to ? (
        <button
          type="button"
          onClick={() => {
            setQ(null);
            setGh(null);
            setHv(null);
            setFrom(null);
            setTo(null);
          }}
          className={cn(
            "rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground transition-colors",
            "hover:bg-muted",
          )}
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
