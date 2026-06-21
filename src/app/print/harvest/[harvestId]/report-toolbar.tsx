"use client";

import { useEffect } from "react";

/**
 * Screen-only toolbar for the printable harvest report. Auto-opens the
 * browser's print dialog shortly after load (so the harvest page's "Download
 * PDF" button is effectively one click → Save as PDF), and offers manual
 * Print / Close buttons. Everything here is hidden in the printed output via
 * the `no-print` class.
 */
export function ReportToolbar({ autoPrint = false }: { autoPrint?: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        /* user can still click the button */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [autoPrint]);

  return (
    <div className="no-print mx-auto mb-5 flex max-w-[820px] items-center justify-between gap-2 px-2">
      <button
        type="button"
        // Opened in a new tab via target=_blank, so closing is best-effort
        // (browsers only let script close script-opened windows). If it can't,
        // the user just closes the tab — no broken navigation either way.
        onClick={() => window.close()}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
      >
        Close
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
      >
        Download PDF
      </button>
    </div>
  );
}
