"use client";

import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OPEN_SEARCH_EVENT } from "@/components/shared/command-palette";

/**
 * Topbar button that opens the global command palette. The palette itself
 * is mounted once in the app layout; this just fires the shared event so
 * the two stay decoupled (topbar is a server component — this is its one
 * small client island for search).
 */
export function SearchTrigger() {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-2 text-muted-foreground"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT))}
      title="Search everything (Ctrl+K)"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="hidden lg:inline">Search</span>
      <kbd className="hidden rounded border bg-muted px-1 py-0.5 text-[9px] lg:inline">
        Ctrl K
      </kbd>
    </Button>
  );
}
