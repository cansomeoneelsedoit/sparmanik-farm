"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { reformatSop } from "@/app/(app)/sops/actions";

/** Progress bar while pages are being formatted in the background; refreshes
 *  the page every 8 s until done. Also hosts the "Reformat" button. */
export function FormatProgress({ sopId, done, total }: { sopId: string; done: number; total: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const running = total > 0 && done < total;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [running, router]);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {running ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((done / total) * 100)}%` }} />
          </div>
          <span>
            Formatting pages… {done}/{total}
          </span>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await reformatSop(sopId);
              if (r.ok) {
                toast.message("Reformatting in the background — this takes a few minutes");
                router.refresh();
              } else toast.error(r.error);
            })
          }
        >
          <Sparkles className="h-3.5 w-3.5" /> Reformat pages
        </Button>
      )}
    </div>
  );
}
