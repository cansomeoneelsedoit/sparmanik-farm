"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  Calculator,
  Calendar,
  ChevronDown,
  ClipboardList,
  CreditCard,
  DollarSign,
  Flag,
  FolderTree,
  GraduationCap,
  HeartPulse,
  LayoutDashboard,
  Leaf,
  ListChecks,
  MessageSquare,
  Package,
  PlayCircle,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
  UserCircle2,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

type LeafItem = {
  /** i18n key under `nav.*` — falls back to `fallback` if missing. */
  key: string;
  href: string;
  /** Hardcoded label used when the i18n catalog doesn't have the key. */
  fallback?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: any;
  /** When >0, render a count chip beside the label. */
  badge?: number;
};

type NavNode = LeafItem | NavGroup;

type NavGroup = {
  /** Label shown on the group header. */
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  /** Stable id for localStorage open/closed persistence. */
  id: string;
  children: LeafItem[];
};

function isGroup(n: NavNode): n is NavGroup {
  return "children" in n;
}

/**
 * SidebarContent renders the nav graph itself. Two callers wrap it:
 *  - `<Sidebar>` (this file) — mounts inside a desktop `<aside>` (hidden on
 *    mobile via `hidden md:flex`)
 *  - `<MobileSidebar>` (in `mobile-sidebar.tsx`) — mounts inside a Sheet
 *    opened by the hamburger in the topbar
 *
 * Lifting it out means we don't re-implement the nav graph in two places
 * and the localStorage-persisted open/closed group state behaves identically
 * on both surfaces.
 */
export function SidebarContent({
  isSuperuser = false,
  openTaskCount = 0,
  onNavigate,
}: {
  isSuperuser?: boolean;
  openTaskCount?: number;
  /** Called whenever the user clicks a nav leaf — the mobile sheet uses this
   *  to close itself on selection so the user lands on the page without a
   *  manual close step. */
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const pathname = usePathname();

  // Persist which groups are expanded across reloads so the user doesn't
  // have to re-open the same group every time. Each group id maps to a
  // boolean.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return defaultOpen();
    try {
      const raw = window.localStorage.getItem("sidebarOpenGroups");
      if (!raw) return defaultOpen();
      return { ...defaultOpen(), ...(JSON.parse(raw) as Record<string, boolean>) };
    } catch {
      return defaultOpen();
    }
  });

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem("sidebarOpenGroups", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  // Nav graph. Top-level pages that need no grouping live at the top so
  // they're always one click away. Grouped pages get their own collapsible
  // section underneath.
  const nav: NavNode[] = [
    { key: "dashboard", href: "/", icon: LayoutDashboard },
    { key: "pos", href: "/pos", fallback: "Register", icon: CreditCard },
    { key: "harvest", href: "/harvest", icon: Leaf },
    { key: "inventory", href: "/inventory", icon: Package },
    { key: "staff", href: "/staff", icon: UserCircle2 },
    { key: "training", href: "/training", fallback: "Training", icon: GraduationCap },
    {
      label: "Operations",
      id: "operations",
      icon: ClipboardList,
      children: [
        { key: "calendar", href: "/calendar", icon: Calendar },
        {
          key: "tasks",
          href: "/tasks",
          icon: Flag,
          // The flag icon stays whether or not we have a count, but the
          // count chip only renders when there's something pending.
          badge: openTaskCount,
        },
        // Stock-take was previously only reachable through Health check —
        // but it's a primary weekly workflow, so it earns a first-class
        // nav entry.
        {
          key: "stocktake",
          href: "/health-check/stocktake",
          fallback: "Stock-take",
          icon: ListChecks,
        },
        // What to order, grouped by supplier, copy-paste into WhatsApp.
        {
          key: "shopping",
          href: "/inventory/shopping-list",
          icon: ShoppingCart,
        },
      ],
    },
    {
      label: "Financial",
      id: "financial",
      icon: DollarSign,
      children: [
        { key: "sales", href: "/sales", icon: DollarSign },
        { key: "expenses", href: "/expenses", icon: DollarSign },
        { key: "suppliers", href: "/suppliers", icon: Truck },
        { key: "customers", href: "/customers", fallback: "Customers", icon: Users },
        // The original "Financials" page is rebranded as the consolidated
        // business view so the user has a clear "where's the bottom line"
        // entry point in the menu.
        {
          key: "financialsTotal",
          href: "/financials",
          fallback: "Total Business Financials",
          icon: DollarSign,
        },
        // Sandbox "what-if" P&L calculator — no real stock touched. Lives
        // under Financial because that's where the user thinks about
        // whether a cycle pays off before committing to it.
        {
          key: "simulator",
          href: "/simulator",
          fallback: "Simulator",
          icon: Calculator,
        },
      ],
    },
    {
      label: "Content",
      id: "content",
      icon: FolderTree,
      children: [
        { key: "recipes", href: "/recipes", icon: Leaf },
        { key: "videos", href: "/videos", icon: PlayCircle },
        { key: "sops", href: "/sops", icon: ClipboardList },
      ],
    },
    { key: "askAi", href: "/ask-ai", icon: Sparkles },
    {
      label: "Settings",
      id: "settings",
      icon: Settings,
      children: [
        { key: "settings", href: "/settings", icon: Settings },
        {
          key: "healthCheck",
          href: "/health-check",
          fallback: "Health check",
          icon: HeartPulse,
        },
        ...(isSuperuser
          ? [{ key: "users", href: "/admin/users", fallback: "Users", icon: UserCircle2 } satisfies LeafItem]
          : []),
      ],
    },
  ];

  function labelFor(item: LeafItem): string {
    // Prefer the translated label; only fall back to the hardcoded English when
    // the key is missing from the catalog. The old order returned `fallback`
    // first, so items like Customers/Financials stayed English even though the
    // ID translation existed (app review #25).
    if (t.has(item.key)) return t(item.key);
    return item.fallback ?? item.key;
  }

  // Group headers (Operations/Financial/Content/Settings) were hardcoded
  // English even in ID mode (app review UX-1). Translate via nav.groups.<id>.
  function groupLabel(node: { id: string; label: string }): string {
    const key = `groups.${node.id}`;
    if (t.has(key)) return t(key);
    return node.label;
  }

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-3 border-b px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent font-serif text-accent-foreground">
          S
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">{tCommon("appName")}</div>
          <div className="text-xs text-muted-foreground">{tCommon("appTagline")}</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {nav.map((node, idx) => {
          if (!isGroup(node)) {
            return (
              <NavLeaf
                key={node.key}
                item={node}
                active={isActive(node.href)}
                label={labelFor(node)}
                onNavigate={onNavigate}
              />
            );
          }
          const groupOpen = openGroups[node.id] ?? true;
          const Icon = node.icon;
          const hasActiveChild = node.children.some((c) => isActive(c.href));
          return (
            <div key={node.id} className={cn(idx > 0 && "mt-2")}>
              <button
                type="button"
                onClick={() => toggleGroup(node.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition",
                  hasActiveChild
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="flex-1 text-left">{groupLabel(node)}</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    groupOpen ? "rotate-0" : "-rotate-90",
                  )}
                />
              </button>
              {groupOpen ? (
                <div className="mt-0.5 space-y-0.5 pl-3">
                  {node.children.map((c) => (
                    <NavLeaf
                      key={c.key}
                      item={c}
                      active={isActive(c.href)}
                      label={labelFor(c)}
                      onNavigate={onNavigate}
                      indent
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
      <div className="flex items-center gap-2 border-t p-3 text-[10px] text-muted-foreground">
        <MessageSquare className="h-3 w-3" /> {tCommon("appName")}
      </div>
    </div>
  );
}

/**
 * Desktop sidebar — hidden under md (768px), fixed-width column on larger
 * viewports. On mobile, `MobileSidebar` takes over via the hamburger in the
 * topbar.
 */
export function Sidebar({
  isSuperuser = false,
  openTaskCount = 0,
}: {
  isSuperuser?: boolean;
  openTaskCount?: number;
}) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-card md:flex">
      <SidebarContent isSuperuser={isSuperuser} openTaskCount={openTaskCount} />
    </aside>
  );
}

function NavLeaf({
  item,
  active,
  label,
  indent,
  onNavigate,
}: {
  item: LeafItem;
  active: boolean;
  label: string;
  indent?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        indent && "pl-5",
        active
          ? "bg-accent/10 font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent/5 hover:text-foreground",
      )}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-70 group-hover:opacity-100" /> : null}
      <span className="flex-1 truncate">{label}</span>
      {item.badge && item.badge > 0 ? (
        <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-semibold leading-none text-destructive-foreground">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      ) : null}
    </Link>
  );
}

/** Initial open/closed state for the collapsible groups. */
function defaultOpen(): Record<string, boolean> {
  return {
    operations: true,
    financial: true,
    content: true,
    settings: true,
  };
}
