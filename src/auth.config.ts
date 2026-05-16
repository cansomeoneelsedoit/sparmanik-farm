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
        const r = (user as any).role as "USER" | "SUPERUSER" | undefined;
        token.role = r ?? "USER";
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        if (token.id) session.user.id = token.id as string;
        session.user.role = (token.role as "USER" | "SUPERUSER" | undefined) ?? "USER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
