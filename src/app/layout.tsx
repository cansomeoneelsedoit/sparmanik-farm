import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { Inter, Instrument_Serif } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sparmanik Farm — Cultivation OS",
  description: "Farm operations, inventory, harvests, and cultivation OS",
};

/**
 * Dark-mode bootstrap. Reads the user's saved preference (or falls back to
 * the OS setting) and sets `class="dark"` on <html> before React hydrates,
 * so dark-mode users don't see a light-theme flash on first paint.
 *
 * Lives in this constant — and is then injected via `next/script` with
 * `strategy="beforeInteractive"` — because rendering a `<script>` tag as a
 * JSX child inside the React tree triggers a Next 16 dev warning ("Scripts
 * inside React components are never executed when rendering on the
 * client"). The Script component bypasses React rendering entirely.
 */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('sf-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${instrumentSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="h-full bg-background text-foreground" suppressHydrationWarning>
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP}
        </Script>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
