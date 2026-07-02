"use client";

import Link from "next/link";
import { todayWIB } from "@/lib/date";
import { useTranslations } from "next-intl";
import { Copy, Phone, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type ShoppingRow = {
  id: string;
  code: string;
  name: string;
  unit: string;
  /** Pre-formatted on-hand quantity in pack units. */
  remaining: string;
  /** Pre-formatted reorder level. */
  reorder: string;
  /** Suggested order quantity (whole packs, restock to 2× reorder). */
  suggest: number;
  tier: "out" | "critical" | "low" | "below";
};

export type SupplierGroup = {
  id: string | null;
  name: string | null;
  phone: string | null;
  rows: ShoppingRow[];
};

const TIER_STYLE: Record<ShoppingRow["tier"], string> = {
  out: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  critical: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  low: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  below: "bg-muted text-muted-foreground",
};

/**
 * The shopping list itself. Pure display + clipboard — all the stock math
 * happened on the server. "Copy list" produces a plain-text order in the
 * current UI language, ready to paste into a WhatsApp chat with the
 * supplier.
 */
export function ShoppingListClient({
  groups,
  anyReorderConfigured,
}: {
  groups: SupplierGroup[];
  anyReorderConfigured: boolean;
}) {
  const t = useTranslations("shopping");

  const tierLabel = (tier: ShoppingRow["tier"]) =>
    tier === "out"
      ? t("tierOut")
      : tier === "critical"
        ? t("tierCritical")
        : tier === "low"
          ? t("tierLow")
          : t("tierBelow");

  function groupText(g: SupplierGroup): string {
    const date = todayWIB();
    const header = t("copyTitle", {
      supplier: g.name ?? t("noSupplier"),
      date,
    });
    const lines = g.rows.map(
      (r) =>
        `- ${r.name}: ${r.suggest} ${r.unit} (${t("copyLineStock", { remaining: r.remaining })})`,
    );
    return [header, ...lines].join("\n");
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("copiedToast"));
    } catch {
      toast.error("Clipboard blocked — copy manually.");
    }
  }

  const totalRows = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-3xl">
            <ShoppingCart className="h-7 w-7 text-muted-foreground" />
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        {groups.length > 1 ? (
          <Button
            variant="outline"
            onClick={() => copy(groups.map(groupText).join("\n\n"))}
          >
            <Copy className="h-4 w-4" /> {t("copyAll")}
          </Button>
        ) : null}
      </header>

      {totalRows === 0 ? (
        <div className="space-y-2 rounded-xl border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
          <p>{t("empty")}</p>
          {!anyReorderConfigured ? <p>{t("emptyTip")}</p> : null}
        </div>
      ) : (
        groups.map((g) => (
          <Card key={g.id ?? "none"}>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                <span className="truncate">{g.name ?? t("noSupplier")}</span>
                <Badge variant="secondary">{g.rows.length}</Badge>
                {g.phone ? (
                  <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                    <Phone className="h-3 w-3" /> {g.phone}
                  </span>
                ) : null}
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => copy(groupText(g))}>
                <Copy className="h-3.5 w-3.5" /> {t("copyGroup")}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">{t("colItem")}</th>
                      <th className="py-2 pr-3 font-medium">{t("colStock")}</th>
                      <th className="py-2 pr-3 font-medium">{t("colReorder")}</th>
                      <th className="py-2 font-medium">{t("colOrder")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {g.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="max-w-[16rem] py-2 pr-3">
                          <Link
                            href={`/inventory/${r.id}`}
                            className="font-medium hover:underline"
                          >
                            {r.name}
                          </Link>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span className="rounded bg-muted px-1 py-0.5 font-mono">
                              {r.code}
                            </span>
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0.5",
                                TIER_STYLE[r.tier],
                              )}
                            >
                              {tierLabel(r.tier)}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 tabular-nums">
                          {r.remaining} {r.unit}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-muted-foreground">
                          {r.reorder} {r.unit}
                        </td>
                        <td className="whitespace-nowrap py-2 font-semibold tabular-nums">
                          {r.suggest} {r.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
