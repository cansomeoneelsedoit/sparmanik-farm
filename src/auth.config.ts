import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config. No adapter, no provider implementations that
 * touch the DB. Imported by middleware.ts so the bundle stays edge-compatible.
 * The full config (with PrismaAdapter + Credentials.authorize) lives in
 * src/auth.ts.
 */
export default {
  pages: { signIn: "/signin" },
  providers: [],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.id = user.id;
        // user.role is populated by the Credentials.authorize callback in
        // src/auth.ts. Default to "USER" so middleware never sees undefined.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = (user as any).role as "USER" | "SUPERUSER" | "PORTAL" | undefined;
        token.role = r ?? "USER";
        // Forced first-login password change for temp-password students. The
        // proxy reads this off the JWT and fences them to /set-password.
        token.mustChangePassword = Boolean((user as { mustChangePassword?: boolean }).mustChangePassword);
        // Owner allow-list: any email in OWNER_EMAILS (comma-separated env var)
        // is always treated as a superuser, regardless of how the account was
        // created — e.g. a fresh Google sign-in that would otherwise default to
        // USER. Lets the owner manage every farm without manual DB provisioning.
        const owners = (process.env.OWNER_EMAILS ?? "")
          .toLowerCase()
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (user.email && owners.includes(user.email.toLowerCase())) {
          token.role = "SUPERUSER";
        }
      }
      // NOTE: mustChangePassword is deliberately NOT cleared from client-
      // supplied session data (no `trigger === "update"` branch). Trusting the
      // client here would let a temp-password student flip the flag off without
      // ever setting a password, defeating the forced rotation. The legitimate
      // flows (set-password + accept-invite forms) instead re-authenticate via
      // signIn("credentials", …), which re-mints this JWT through authorize()
      // reading the fresh DB value — the only trustworthy source.
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        if (token.id) session.user.id = token.id as string;
        session.user.role = (token.role as "USER" | "SUPERUSER" | "PORTAL" | undefined) ?? "USER";
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
