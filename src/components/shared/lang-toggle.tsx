"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/routing";

const LOCALES: Locale[] = ["en", "id"];

export function LangToggle() {
  const current = useLocale() as Locale;
  const [pending, startTransition] = useTransition();

  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border bg-background p-0.5">
      {LOCALES.map((locale) => (
        <Button
          key={locale}
          size="sm"
          variant="ghost"
          className={cn(
            "h-7 px-2 text-xs uppercase tracking-wide",
            current === locale && "bg-accent text-accent-foreground hover:bg-accent/90 hover:text-accent-foreground",
          )}
          disabled={pending}
          onClick={() => startTransition(() => setLocale(locale))}
        >
          {locale}
        </Button>
      ))}
    </div>
  );
}
