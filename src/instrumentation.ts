/**
 * Boot-time environment validation. Next.js runs `register()` once when the
 * server starts. The goal (app review #45) is to fail fast with a plain-English
 * message instead of a cryptic 500 at first sign-in when a required variable is
 * missing or left at its placeholder.
 */
export async function register() {
  // Only run in the Node.js server runtime (not the Edge proxy).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const isProd = process.env.NODE_ENV === "production";
  const problems: string[] = [];
  const warnings: string[] = [];

  if (!process.env.DATABASE_URL) {
    problems.push("DATABASE_URL is not set — the app cannot reach its database.");
  }

  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    problems.push("AUTH_SECRET is not set — sign-in tokens cannot be signed. Generate one with: openssl rand -base64 32");
  } else if (secret === "change-me-in-prod") {
    // A placeholder secret means session tokens are forgeable → full auth bypass.
    const msg =
      "AUTH_SECRET is still the placeholder 'change-me-in-prod'. This makes all sign-in tokens forgeable. Generate a real one: openssl rand -base64 32";
    if (isProd) problems.push(msg);
    else warnings.push(msg + " (tolerated in development)");
  }

  if (isProd && !process.env.AUTH_URL && !process.env.NEXTAUTH_URL) {
    warnings.push("AUTH_URL is not set in production — OAuth callbacks may build wrong URLs.");
  }

  // Optional features: report which are off so a typo'd var name is
  // distinguishable from a deliberate omission.
  const googleOn = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const anthropicEnv = !!process.env.ANTHROPIC_API_KEY;
  const geminiEnv = !!process.env.GEMINI_API_KEY;
  console.log(
    `[env] optional features — Google sign-in: ${googleOn ? "on" : "off"}; ` +
      `Anthropic env key: ${anthropicEnv ? "on" : "off"}; Gemini env key: ${geminiEnv ? "on" : "off"} ` +
      `(AI also reads per-org keys from Settings → AI keys)`,
  );

  for (const w of warnings) console.warn(`[env] WARNING: ${w}`);

  if (problems.length) {
    const banner =
      "\n========================================\n" +
      "  Sparmanik Farm cannot start — fix these environment variables:\n" +
      problems.map((p) => `   • ${p}`).join("\n") +
      "\n========================================\n";
    console.error(banner);
    // Fail loudly in production so a misconfigured deploy doesn't silently
    // limp along and 500 at first sign-in.
    if (isProd) throw new Error("Missing/invalid required environment variables (see log above).");
  }
}
