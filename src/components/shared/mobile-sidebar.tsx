"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SidebarContent } from "@/components/shared/sidebar";

/**
 * Hamburger trigger that opens the full nav in a left-side Sheet — visible
 * only under md (768px). The desktop fixed-column `<Sidebar>` is hidden
 * under that breakpoint, so this is the user's only way to navigate on a
 * phone / narrow tablet.
 *
 * On every nav click the Sheet auto-closes so the user lands on the next
 * page without an extra dismiss step.
 */
export function MobileSidebar({
  isSuperuser = false,
  openTaskCount = 0,
}: {
  isSuperuser?: boolean;
  openTaskCount?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="md:hidden"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>
      <SheetContent side="left" className="w-72 p-0">
        <SidebarContent
          isSuperuser={isSuperuser}
          openTaskCount={openTaskCount}
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
