/**
 * Segment-level loading skeleton for every authenticated page. With
 * `force-dynamic` + global no-store headers, each navigation re-renders
 * the page on the server — without this boundary the old page just
 * freezes until the new one arrives, which reads as "the app is slow".
 * A skeleton that paints instantly makes the same wait feel responsive.
 *
 * Shape mirrors the common page anatomy: serif page title, a stat-card
 * strip, then two content blocks. Generic enough to stand in for any of
 * the (app) routes.
 */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-8 w-56 rounded-md bg-muted" />
        <div className="h-4 w-80 max-w-full rounded-md bg-muted/70" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border bg-card p-4">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="mt-2 h-6 w-28 rounded bg-muted/70" />
          </div>
        ))}
      </div>
      <div className="h-64 rounded-xl border bg-card" />
      <div className="h-40 rounded-xl border bg-card" />
    </div>
  );
}
