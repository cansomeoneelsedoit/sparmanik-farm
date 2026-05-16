"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, ChevronDown, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { setActiveOrg } from "@/server/org-actions";

type Org = { id: string; name: string; slug: string; role: "OWNER" | "MEMBER" };

/**
 * Xero-style organisation switcher. Sits at the very left of the topbar,
 * showing the active org's name with a chevron. Click to drop a list of
 * orgs the user belongs to; selecting one writes the cookie + revalidates.
 */
export function OrgSwitcher({
  orgs,
  activeId,
}: {
  orgs: Org[];
  activeId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (orgs.length === 0) return null;

  const active = orgs.find((o) => o.id === activeId) ?? orgs[0];

  function pick(id: string) {
    if (id === active.id) {
      setOpen(false);
      return;
    }
    startT(async () => {
      const r = await setActiveOrg(id);
      if (r.ok) {
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  // Single-org case: no need for a dropdown; just show the name.
  if (orgs.length === 1) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-sm">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{active.name}</span>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted/40 disabled:opacity-50"
      >
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{active.name}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-[100] mt-1 w-64 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Switch organisation
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {orgs.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => pick(o.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent/10",
                  o.id === active.id && "bg-accent/10",
                )}
              >
                <Check className={cn("h-3.5 w-3.5", o.id === active.id ? "opacity-100" : "opacity-0")} />
                <span className="flex-1">
                  <span className="block truncate font-medium">{o.name}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    {o.role === "OWNER" ? "Owner" : "Member"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
