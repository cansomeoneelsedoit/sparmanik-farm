"use client";

import { useEffect } from "react";
import { MessageCircle, Printer } from "lucide-react";

/**
 * Screen-only toolbar for the POS receipt: auto-opens the print dialog (Save as
 * PDF) and offers a WhatsApp share — the Indonesia-appropriate way to hand a
 * customer their receipt. Hidden in print via `no-print`.
 */
export function ReceiptToolbar({ autoPrint = false, shareText }: { autoPrint?: boolean; shareText: string }) {
  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        /* user can still click Print */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [autoPrint]);

  async function share() {
    // Prefer the native share sheet (mobile); fall back to the wa.me deep link.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: shareText });
        return;
      } catch {
        /* cancelled / unsupported → fall through */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="no-print mx-auto mb-4 flex max-w-[360px] items-center justify-between gap-2 px-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
      >
        <Printer className="h-4 w-4" /> Print / PDF
      </button>
      <button
        type="button"
        onClick={share}
        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
      >
        <MessageCircle className="h-4 w-4" /> WhatsApp
      </button>
    </div>
  );
}
