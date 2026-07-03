import { Download } from "lucide-react";

/**
 * Plain link to a CSV export route (app review #41). A server component — no
 * client JS; the browser downloads via Content-Disposition on the route.
 */
export function DownloadCsvButton({
  type,
  label = "Download CSV",
}: {
  type: "sales" | "expenses" | "wages" | "inventory";
  label?: string;
}) {
  return (
    <a
      href={`/api/export/${type}`}
      download
      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}
