"use client";

import { useQueryState } from "nuqs";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

/**
 * URL-backed (?q=) course search — same nuqs pattern as the inventory
 * filters: `shallow: false` re-runs the server component so the filtering
 * happens in the Prisma query, and the URL stays shareable/back-button safe.
 */
export function TrainingSearch() {
  const t = useTranslations("training");
  const [q, setQ] = useQueryState("q", { defaultValue: "", shallow: false });

  return (
    <div className="relative sm:max-w-md">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={t("searchPlaceholder")}
        value={q}
        onChange={(e) => setQ(e.target.value || null)}
        className="h-11 rounded-full pl-10 shadow-sm"
      />
    </div>
  );
}
