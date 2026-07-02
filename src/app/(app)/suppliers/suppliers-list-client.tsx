"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Package, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  batchCount: number;
  totalSpendDisplay: React.ReactNode;
  totalSpendNum: number;
  lastDelivery: string | null;
  /** Items this supplier has ever delivered, sorted by spend desc. */
  items: { id: string; code: string; name: string; batches: number }[];
};

type Sort = "name" | "spend" | "recent" | "batches";

export function SuppliersListClient({ suppliers }: { suppliers: SupplierRow[] }) {
  const [q, setQ] = useState("");
  const [productQ, setProductQ] = useState("");
  const [sort, setSort] = useState<Sort>("name");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const productNeedle = productQ.trim().toLowerCase();
    const list = suppliers.filter((s) => {
      // Name / phone / email search.
      if (needle) {
        const matchesGeneral =
          s.name.toLowerCase().includes(needle) ||
          (s.email && s.email.toLowerCase().includes(needle)) ||
          (s.phone && s.phone.toLowerCase().includes(needle));
        if (!matchesGeneral) return false;
      }
      // Product search — hide suppliers who don't carry an item whose name
      // or code contains the typed text. This is the "show me who sells
      // rockwool" affordance the user asked for.
      if (productNeedle) {
        const hit = s.items.some(
          (i) =>
            i.name.toLowerCase().includes(productNeedle) ||
            i.code.toLowerCase().includes(productNeedle),
        );
        if (!hit) return false;
      }
      return true;
    });
    const copy = [...list];
    if (sort === "name") copy.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "spend") copy.sort((a, b) => b.totalSpendNum - a.totalSpendNum);
    if (sort === "batches") copy.sort((a, b) => b.batchCount - a.batchCount);
    if (sort === "recent") {
      copy.sort((a, b) => (b.lastDelivery ?? "").localeCompare(a.lastDelivery ?? ""));
    }
    return copy;
  }, [suppliers, q, productQ, sort]);

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search suppliers (name, phone, email)…"
              className="pl-9"
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
          <div className="relative">
            <Package className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={productQ}
              onChange={(e) => setProductQ(e.target.value)}
              placeholder="Search by product (e.g. rockwool, SF00012)…"
              className="pl-9"
            />
            {productQ ? (
              <button
                type="button"
                onClick={() => setProductQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border bg-background p-0.5">
            {(
              [
                { v: "name", label: "Name" },
                { v: "spend", label: "Spend" },
                { v: "batches", label: "Batches" },
                { v: "recent", label: "Recent" },
              ] as { v: Sort; label: string }[]
            ).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setSort(opt.v)}
                className={cn(
                  "rounded px-3 py-1 text-xs transition-colors",
                  sort === opt.v
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground sm:ml-auto">
            {filtered.length} of {suppliers.length}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            {q || productQ ? "No suppliers match your search." : "No suppliers yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => {
            const initials = s.name
              .split(/\s+/)
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();
            return (
              <Card key={s.id} className="transition hover:shadow-md">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 font-semibold text-accent">
                      {initials}
                    </div>
                    <CardTitle className="truncate">{s.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {s.phone ? <div className="text-muted-foreground">{s.phone}</div> : null}
                  {s.email ? <div className="truncate text-muted-foreground">{s.email}</div> : null}
                  <div className="grid grid-cols-2 gap-2 border-t pt-3 text-xs">
                    <div>
                      <div className="text-muted-foreground">Batches</div>
                      <div className="font-medium">{s.batchCount}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-muted-foreground">Total spend</div>
                      <div className="font-medium">{s.totalSpendDisplay}</div>
                    </div>
                  </div>
                  {s.items.length > 0 ? (
                    <div className="space-y-1.5 border-t pt-3">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Products supplied · {s.items.length}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {s.items.slice(0, 6).map((i) => (
                          <Link
                            key={i.id}
                            href={`/inventory/${i.id}`}
                            className="rounded-full border bg-background px-1.5 py-0.5 text-[10px] hover:border-accent hover:text-foreground"
                            title={`${i.code} · ${i.batches} batch${i.batches === 1 ? "" : "es"}`}
                          >
                            {i.name}
                          </Link>
                        ))}
                        {s.items.length > 6 ? (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            +{s.items.length - 6} more
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {s.lastDelivery ? (
                    <div className="border-t pt-2 text-[10px] text-muted-foreground">
                      Last delivery: {s.lastDelivery}
                    </div>
                  ) : null}
                  <div className="pt-2">
                    <Button asChild size="sm" variant="outline" className="w-full">
                      <Link href={`/suppliers/${s.id}`}>View</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
