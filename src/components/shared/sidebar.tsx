"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

type NavItem = { key: string; href: string };

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/" },
  { key: "calendar", href: "/calendar" },
  { key: "sales", href: "/sales" },
  { key: "harvest", href: "/harvest" },
  { key: "tasks", href: "/tasks" },
  { key: "inventory", href: "/inventory" },
  { key: "recipes", href: "/recipes" },
  { key: "sops", href: "/sops" },
  { key: "videos", href: "/videos" },
  { key: "suppliers", href: "/suppliers" },
  { key: "staff", href: "/staff" },
  { key: "financials", href: "/financials" },
  { key: "settings", href: "/settings" },
  { key: "askAi", href: "/ask-ai" },
];

export function Sidebar({ isSuperuser = false }: { isSuperuser?: boolean }) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const pathname = usePathname();

  // The "Users" admin link only appears for superusers — it's the gateway to
  // /admin/users (create / edit / reset password / delete other users).
  const items: NavItem[] = isSuperuser
    ? [...NAV_ITEMS, { key: "users", href: "/admin/users" }]
    : NAV_ITEMS;

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-card md:flex">
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
        {items.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
          // The "users" key isn't in the i18n catalog; fall back to a literal.
          const label = item.key === "users" ? "Users" : t(item.key);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "block rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent/10 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/5 hover:text-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
