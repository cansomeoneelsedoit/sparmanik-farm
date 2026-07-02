"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { SmartImage } from "@/components/shared/smart-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomerFormDialog } from "@/app/(app)/customers/customer-form-dialog";
import { deleteCustomer } from "@/app/(app)/customers/actions";

export type CustomerRow = {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  hasLogo: boolean;
  salesCount: number;
  /** Pre-formatted total (server-rendered <Money> string). */
  totalDisplay: React.ReactNode;
  lastSale: string | null;
};

const TYPE_STYLE: Record<string, string> = {
  WHOLESALER: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  RETAILER: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  CONSUMER: "bg-muted text-muted-foreground",
};
const typeLabel = (t: string) =>
  t === "WHOLESALER" ? "Wholesaler" : t === "RETAILER" ? "Retailer" : "Consumer";

export function CustomersListClient({ customers }: { customers: CustomerRow[] }) {
  const [search, setSearch] = useState("");
  const [pending, startT] = useTransition();
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        typeLabel(c.type).toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q),
    );
  }, [customers, search]);

  function onDelete(c: CustomerRow) {
    if (!confirm(`Delete customer "${c.name}"? Their past sales stay but become unattributed.`)) return;
    startT(async () => {
      const r = await deleteCustomer(c.id);
      if (r.ok) {
        toast.success("Customer deleted");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customers by name, type, phone, email…"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
          {customers.length === 0 ? "No customers yet. Add one, or create them on the fly when logging a sale." : "No customers match this search."}
        </div>
      ) : (
        <>
        {/* Desktop table; card list below lg (app review UX — tablet tables). */}
        <div className="hidden overflow-x-auto rounded-xl border bg-card lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Contact</th>
                <th className="px-4 py-2.5 text-right font-medium">Sales</th>
                <th className="px-4 py-2.5 text-right font-medium">Total bought</th>
                <th className="px-4 py-2.5 font-medium">Last sale</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">
                    <div className="flex items-center gap-2.5">
                      {c.hasLogo ? (
                        <SmartImage
                          src={`/api/customers/${c.id}/logo`}
                          alt={c.name}
                          className="h-7 w-7 shrink-0 rounded border object-contain"
                        />
                      ) : null}
                      <span>{c.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px]", TYPE_STYLE[c.type] ?? TYPE_STYLE.CONSUMER)}>
                      {typeLabel(c.type)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {c.phone || c.email ? (
                      <span className="flex flex-col text-xs">
                        {c.phone ? <span>{c.phone}</span> : null}
                        {c.email ? <span>{c.email}</span> : null}
                      </span>
                    ) : (
                      <span className="text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {c.salesCount > 0 ? <Badge variant="secondary">{c.salesCount}</Badge> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{c.totalDisplay}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.lastSale ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <CustomerFormDialog
                        existing={{ id: c.id, name: c.name, type: c.type, phone: c.phone, email: c.email, notes: c.notes, hasLogo: c.hasLogo }}
                        trigger={
                          <Button size="icon" variant="ghost" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <Button size="icon" variant="ghost" title="Delete" disabled={pending} onClick={() => onDelete(c)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divide-y rounded-xl border bg-card lg:hidden">
          {filtered.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2.5">
                  {c.hasLogo ? (
                    <SmartImage
                      src={`/api/customers/${c.id}/logo`}
                      alt={c.name}
                      className="h-7 w-7 shrink-0 rounded border object-contain"
                    />
                  ) : null}
                  <span className="truncate font-medium">{c.name}</span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px]", TYPE_STYLE[c.type] ?? TYPE_STYLE.CONSUMER)}>
                    {typeLabel(c.type)}
                  </span>
                </div>
                {c.phone || c.email ? (
                  <div className="text-xs text-muted-foreground">
                    {[c.phone, c.email].filter(Boolean).join(" · ")}
                  </div>
                ) : null}
                <div className="text-xs text-muted-foreground">
                  {c.salesCount > 0 ? `${c.salesCount} sales` : "No sales yet"}
                  {c.lastSale ? ` · last ${c.lastSale}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <div className="font-medium tabular-nums">{c.totalDisplay}</div>
                <div className="flex gap-1">
                  <CustomerFormDialog
                    existing={{ id: c.id, name: c.name, type: c.type, phone: c.phone, email: c.email, notes: c.notes, hasLogo: c.hasLogo }}
                    trigger={
                      <Button size="icon" variant="ghost" title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    }
                  />
                  <Button size="icon" variant="ghost" title="Delete" disabled={pending} onClick={() => onDelete(c)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
