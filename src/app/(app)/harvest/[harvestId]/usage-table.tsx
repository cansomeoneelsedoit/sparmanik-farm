"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoneyDualClient } from "@/components/shared/money-client";
import { DeleteUsageButton } from "@/app/(app)/harvest/[harvestId]/row-actions";

export type UsageRow = {
  id: string;
  date: string;
  name: string;
  qty: string;
  /** Whole-rupiah cost as string. */
  cost: string;
};

const PAGE = 10;

/**
 * Usage list: newest first, 10 at a time with "Show more", plus a search box
 * (matches item name, quantity text or date). Total row always reflects the
 * whole list, not just what's visible.
 */
export function UsageTable({
  rows,
  total,
  exchangeRate,
}: {
  rows: UsageRow[];
  total: string;
  exchangeRate: string | null;
}) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(needle) || r.qty.toLowerCase().includes(needle) || r.date.includes(needle),
    );
  }, [rows, q]);
  const visible = filtered.slice(0, limit);
  const filteredTotal = filtered.reduce((s, r) => s + Number(r.cost), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search item, qty or date…"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {q ? `${filtered.length} of ${rows.length}` : `${rows.length}`} entr{rows.length === 1 ? "y" : "ies"}
          {q ? (
            <>
              {" · "}
              <MoneyDualClient value={String(Math.round(filteredTotal))} exchangeRate={exchangeRate} className="inline-flex" />
            </>
          ) : null}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                No entries match “{q}”.
              </TableCell>
            </TableRow>
          ) : (
            visible.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="text-muted-foreground">{u.date}</TableCell>
                <TableCell>{u.name}</TableCell>
                <TableCell className="text-right">{u.qty}</TableCell>
                <TableCell className="text-right">
                  <MoneyDualClient value={u.cost} exchangeRate={exchangeRate} />
                </TableCell>
                <TableCell className="p-0">
                  <DeleteUsageButton id={u.id} />
                </TableCell>
              </TableRow>
            ))
          )}
          {filtered.length > visible.length ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="py-2 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                    Show {Math.min(PAGE, filtered.length - visible.length)} more
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setLimit(filtered.length)}>
                    Show all {filtered.length}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ) : filtered.length > PAGE ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="py-2 text-center">
                <Button variant="ghost" size="sm" onClick={() => setLimit(PAGE)}>
                  Show fewer
                </Button>
              </TableCell>
            </TableRow>
          ) : null}
          <TableRow className="border-t-2 bg-muted/20 font-semibold hover:bg-muted/20">
            <TableCell colSpan={3} className="text-right">Total</TableCell>
            <TableCell className="text-right text-red-600">
              <MoneyDualClient value={total} exchangeRate={exchangeRate} />
            </TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
