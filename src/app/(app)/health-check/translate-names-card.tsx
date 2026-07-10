"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Languages, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { generateEnglishNamesBatch } from "./translate-names-actions";

/**
 * Health Check card: "N items have no English display name → Generate".
 * Loops the batch action until nothing remains, showing live progress.
 * Superuser-only (enforced server-side; the page only renders this for
 * superusers anyway).
 */
export function TranslateNamesCard({ missing }: { missing: number }) {
  const t = useTranslations("healthNames");
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(missing);

  async function run() {
    setRunning(true);
    try {
      // Keep pulling batches until the queue is empty or an error stops us.
      let remaining = left;
      while (remaining > 0) {
        const r = await generateEnglishNamesBatch();
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        remaining = r.remaining;
        setLeft(remaining);
        if (r.translated === 0) break; // safety: no progress → stop
      }
      toast.success(t("done"));
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  if (left <= 0) return null;

  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent-foreground">
        <Languages className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold">{t("title")}</div>
        <div className="text-xs text-muted-foreground">{t("blurb", { count: left })}</div>
      </div>
      <Button onClick={run} disabled={running}>
        {running ? (
          <>
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            {t("running", { count: left })}
          </>
        ) : (
          t("generate")
        )}
      </Button>
    </div>
  );
}
