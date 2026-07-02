import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInForm } from "@/app/(auth)/signin/signin-form";
import { LangToggle } from "@/components/shared/lang-toggle";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const t = await getTranslations("signin");
  const tCommon = await getTranslations("common");
  const { callbackUrl, error } = await searchParams;
  return (
    <Card>
      <CardHeader className="space-y-3">
        {/* Brand + language switch so an Indonesian staffer can set their
            language before signing in (app review UX-1 / polish). */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent font-serif text-accent-foreground">
              S
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">{tCommon("appName")}</div>
              <div className="text-xs text-muted-foreground">{tCommon("appTagline")}</div>
            </div>
          </div>
          <LangToggle />
        </div>
        <div>
          <CardTitle className="font-serif text-2xl">{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <SignInForm callbackUrl={callbackUrl ?? "/"} initialError={error} />
      </CardContent>
    </Card>
  );
}
