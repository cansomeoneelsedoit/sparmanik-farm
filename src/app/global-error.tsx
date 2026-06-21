"use client";

/**
 * Top-level error boundary. Replaces Next's auto-generated /_global-error page,
 * which failed to prerender during `next build` ("Cannot read properties of
 * null (reading 'useContext')") on Next 16 + React 19. This one is fully
 * self-contained — no app imports, no context, inline styles — so it
 * prerenders cleanly and still renders if the whole app tree crashes.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          background: "#fafafa",
          color: "#18181b",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>Something went wrong</h1>
          <p style={{ color: "#71717a", margin: "0 0 1.5rem", fontSize: "0.9rem" }}>
            An unexpected error occurred. Try again, or reload the page.
            {error?.digest ? ` (ref: ${error.digest})` : ""}
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "0.375rem",
              background: "#18181b",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
