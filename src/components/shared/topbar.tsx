import { getTranslations } from "next-intl/server";
import { signOut } from "@/auth";
import { prisma } from "@/server/prisma";
import { getAlerts } from "@/server/alerts";
import { recentActions } from "@/server/audit";
import { listMyOrgs, getActiveOrgId } from "@/server/org";
import { LangToggle } from "@/components/shared/lang-toggle";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { AlertBell } from "@/components/shared/alert-bell";
import { AuditHistorySheet } from "@/components/shared/audit-history-sheet";
import { OrgSwitcher } from "@/components/shared/org-switcher";
import { ClearCacheButton } from "@/components/shared/clear-cache-button";
import { MobileSidebar } from "@/components/shared/mobile-sidebar";
import { SearchTrigger } from "@/components/shared/search-trigger";
import { Button } from "@/components/ui/button";

async function getCurrentRate() {
  const setting = await prisma.setting.findFirst();
  return setting?.exchangeRate.toFixed(0) ?? "—";
}

export async function Topbar({
  userName,
  isSuperuser = false,
  openTaskCount = 0,
}: {
  userName?: string | null;
  isSuperuser?: boolean;
  openTaskCount?: number;
}) {
  const t = await getTranslations("topbar");
  const tCommon = await getTranslations("common");
  const [rate, alerts, actions, orgs, activeOrgId] = await Promise.all([
    getCurrentRate(),
    getAlerts(),
    recentActions(50),
    listMyOrgs(),
    getActiveOrgId(),
  ]);

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    // gap-2 on mobile so the controls don't overflow, gap-3 on sm+ for
    // breathing room. The whole right cluster scrolls horizontally as a
    // last resort if the user has a very narrow viewport.
    <header className="flex h-14 items-center justify-between gap-2 border-b bg-background px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {/* Mobile-only hamburger: opens the nav in a left Sheet. */}
        <MobileSidebar isSuperuser={isSuperuser} openTaskCount={openTaskCount} />
        <OrgSwitcher orgs={orgs} activeId={activeOrgId} />
        {/* Welcome line — hide the muted label on small phones, just the
            name remains so we don't burn horizontal space. */}
        <span className="hidden text-muted-foreground sm:inline">
          {tCommon("welcome")}
        </span>
        <span className="hidden truncate font-medium sm:inline">
          {userName ?? ""}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs sm:gap-3">
        {/* Global search — opens the Ctrl+K command palette. */}
        <SearchTrigger />
        {/* Exchange rate label is informational — hide on phones, show on md+
            where we have room. */}
        <span className="hidden text-muted-foreground md:inline">
          {t("rateLabel")}:{" "}
          <span className="font-medium text-foreground">{rate}</span>{" "}
          {t("rateUnit")}
        </span>
        {/* Clear-cache + lang/theme toggles are nice-to-haves; bury them on
            phone so the bell, audit, and sign-out stay reachable. */}
        <div className="hidden items-center gap-2 md:flex">
          <ClearCacheButton />
          <LangToggle />
          <ThemeToggle />
        </div>
        <AlertBell alerts={alerts} />
        <AuditHistorySheet
          entries={actions.map((a: { id: string; type: string; description: string; createdAt: Date; undone: boolean }) => ({
            id: a.id,
            type: a.type,
            description: a.description,
            createdAt: a.createdAt.toISOString(),
            undone: a.undone,
          }))}
        />
        <form action={doSignOut}>
          <Button size="sm" variant="ghost" className="px-2 sm:px-3">
            {tCommon("signOut")}
          </Button>
        </form>
      </div>
    </header>
  );
}
