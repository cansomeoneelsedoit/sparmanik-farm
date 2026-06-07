"use client";

import { useEffect, useState } from "react";

export function ClearPageClient() {
  const [stage, setStage] = useState<string>("Starting…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setStage("Clearing browser cache storage…");
        if ("caches" in window) {
          const names = await caches.keys();
          await Promise.all(names.map((n) => caches.delete(n)));
        }
        if (cancelled) return;

        setStage("Unregistering service workers…");
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if (cancelled) return;

        setStage("Wiping local + session storage…");
        try {
          localStorage.clear();
        } catch {}
        try {
          sessionStorage.clear();
        } catch {}

        setStage("Reloading to home with a fresh URL…");
        // Bust the network cache on reload with a fresh timestamp so even
        // an aggressive browser proxy can't serve stale HTML.
        setTimeout(() => {
          const u = new URL("/", window.location.href);
          u.searchParams.set("_t", Date.now().toString());
          window.location.replace(u.toString());
        }, 600);
      } catch (e) {
        setStage(
          "Couldn't clear automatically — please press Ctrl+Shift+R (Cmd+Shift+R on Mac). Error: " +
            (e instanceof Error ? e.message : String(e)),
        );
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-3 rounded-lg border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl dark:bg-amber-900/40">
          🧹
        </div>
        <h1 className="font-serif text-2xl">Clearing cache</h1>
        <p className="text-sm text-muted-foreground">{stage}</p>
        <p className="text-xs text-muted-foreground">
          If this page hangs for more than 5 seconds, press{" "}
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            Ctrl+Shift+R
          </kbd>{" "}
          to force a hard refresh.
        </p>
      </div>
    </div>
  );
}
