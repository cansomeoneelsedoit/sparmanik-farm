"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * In-shell error boundary (app review #23). Without this, any server-action or
 * render throw replaces the whole app with Next's default full-page crash and
 * the user loses what they were doing. This keeps the sidebar/topbar and offers
 * a "try again" that re-runs the failed segment.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          That action didn’t complete — it might have been a brief connection or
          server hiccup. Your other data is safe. Try again, or reload the page.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </div>
    </div>
  );
}
