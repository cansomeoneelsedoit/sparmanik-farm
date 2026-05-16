import { getTranslations } from "next-intl/server";
import { signOut } from "@/auth";
import { prisma } from "@/server/prisma";
import { getAlerts } from "@/server/alerts";
import { recentActions } from "@/server/audit";
import { LangToggle } from "@/components/shared/lang-toggle";
import { AlertBell } from "@/components/shared/alert-bell";
import { AuditHistorySheet } from "@/components/shared/audit-history-sheet";
import { Button } from "@/components/ui/button";

async function getCurrentRate() {
  const setting = await prisma.setting.findFirst();
  return setting?.exchangeRate.toFixed(0) ?? "—";
}

export async function Topbar({ userName }: { userName?: string | null }) {
  const t = await getTranslations("topbar");
  const tCommon = await getTranslations("common");
  const [rate, alerts, actions] = await Promise.all([
    getCurrentRate(),
    getAlerts(),
    recentActions(50),
  ]);

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">{tCommon("welcome")}</span>
        <span className="font-medium">{userName ?? ""}</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground">
          {t("rateLabel")}: <span className="font-medium text-foreground">{rate}</span> {t("rateUnit")}
        </span>
        <LangToggle />
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
          <Button size="sm" variant="ghost">
            {tCommon("signOut")}
          </Button>
        </form>
      </div>
    </header>
  );
}
