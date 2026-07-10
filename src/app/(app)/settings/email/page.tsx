import { prisma } from "@/server/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailManager } from "@/app/(app)/settings/email/email-manager";

export const dynamic = "force-dynamic";

/**
 * Settings → Email: the Gmail account receipts are sent FROM (SMTP + App
 * Password, same masked-credential treatment as AI keys). Sending via Gmail's
 * own server means every receipt lands in the account's Sent folder — a
 * permanent record of what was sold.
 */
export default async function EmailSettingsPage() {
  const acc = (await prisma.mailAccount.findFirst()) as {
    id: string;
    email: string;
    appPassword: string;
    enabled: boolean;
    lastStatus: string | null;
    lastUsedAt: Date | null;
    lastError: string | null;
  } | null;

  const masked = acc
    ? {
        id: acc.id,
        email: acc.email,
        maskedPassword: "•".repeat(12) + acc.appPassword.slice(-4),
        enabled: acc.enabled,
        lastStatus: acc.lastStatus,
        lastUsedAt: acc.lastUsedAt?.toISOString() ?? null,
        lastError: acc.lastError,
      }
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receipt email (Gmail)</CardTitle>
        <p className="pt-1 text-xs text-muted-foreground">
          Receipts are emailed FROM this Gmail address, so a copy of every
          receipt lands in its Sent folder automatically. One-time setup on
          the Google account: turn on 2-Step Verification, then create an App
          Password at myaccount.google.com/apppasswords and paste it here —
          the normal account password will NOT work.
        </p>
      </CardHeader>
      <CardContent>
        <EmailManager account={masked} />
      </CardContent>
    </Card>
  );
}
