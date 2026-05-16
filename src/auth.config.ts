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
      if (user) token.id = user.id;
      return token;
    },
    session: ({ session, token }) => {
      if (session.user && token.id) session.user.id = token.id as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
