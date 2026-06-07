"use client";

import { useState } from "react";
import { Brush } from "lucide-react";
import { toast } from "sonner";

/**
 * Debug button in the topbar: blows away every browser-side cache it can
 * find (Cache Storage API, Service Worker registrations, localStorage,
 * sessionStorage) and forces a hard reload with a cache-busting query
 * param. Sized to be obvious so non-tech staff can find it quickly when
 * something looks stale.
 *
 * Fallback URL `/clear` (see app/clear/page.tsx) runs the same logic for
 * users whose topbar didn't render yet.
 */
export function ClearCacheButton() {
  const [working, setWorking] = useState(false);

  async function handleClick() {
    setWorking(true);
    try {
      if (typeof window !== "undefined" && "caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      try {
        localStorage.clear();
      } catch {}
      try {
        sessionStorage.clear();
      } catch {}
      toast.success("Cache cleared — reloading…");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cache clear failed");
    } finally {
      // Bust the network cache for the reload by appending a fresh timestamp,
      // then strip it on the next normal navigation. setTimeout so the toast
      // has a moment to paint.
      setTimeout(() => {
        const u = new URL(window.location.href);
        u.searchParams.set("_t", Date.now().toString());
        window.location.replace(u.toString());
      }, 200);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={working}
      title="Wipe browser cache and reload — use if a change isn't showing"
      className="flex items-center gap-1.5 rounded-md border border-amber-400 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm transition-colors hover:bg-amber-200 disabled:opacity-50 dark:border-amber-600 dark:bg-amber-900/50 dark:text-amber-100 dark:hover:bg-amber-900/70"
    >
      <Brush className="h-3.5 w-3.5" />
      {working ? "Clearing…" : "Clear cache"}
    </button>
  );
}
