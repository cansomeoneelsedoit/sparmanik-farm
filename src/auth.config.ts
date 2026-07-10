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
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        if (token.id) session.user.id = token.id as string;
        session.user.role = (token.role as "USER" | "SUPERUSER" | "PORTAL" | undefined) ?? "USER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
