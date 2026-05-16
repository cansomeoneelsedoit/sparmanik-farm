"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { routing, type Locale } from "@/i18n/routing";

const LOCALE_COOKIE = "NEXT_LOCALE";

export async function setLocale(locale: Locale) {
  if (!(routing.locales as readonly string[]).includes(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
