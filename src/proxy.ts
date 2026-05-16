import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import authConfig from "@/auth.config";

/**
 * Auth.js v5 Proxy (Next 16's replacement for middleware). Edge-safe: uses
 * auth.config which has no DB adapter. Blocks unauthenticated access to all
 * non-public routes — anything that isn't /signin, /api/auth/*, or a static
 * asset — by redirecting to /signin?callbackUrl=…
 */
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/signin"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default auth((req) => {
  const { nextUrl } = req;
  if (isPublic(nextUrl.pathname)) return;
  if (req.auth) return;

  const url = nextUrl.clone();
  url.pathname = "/signin";
  url.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
  return NextResponse.redirect(url);
});

export const config = {
  matcher: [
    // Match everything except: /api/auth/*, /api/health (public for Railway
    // health-check), /api/uploads/* (handled inside the route via auth()),
    // Next internals, and static files.
    "/((?!api/auth|api/health|api/uploads|_next/static|_next/image|favicon.ico|farm-legacy.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
