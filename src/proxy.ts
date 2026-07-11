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

// /accept-invite: a student clicks the emailed "set your password" link BEFORE
// they have a session, so it must be reachable while signed out (the token in
// the URL is the credential — validated server-side).
// /learn: the dedicated student login door (separate from the staff /signin).
const PUBLIC_PATHS = ["/signin", "/accept-invite", "/learn"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Paths an education-portal (PORTAL) login may reach. Everything else —
 * dashboard, farm pages, /pos, /print/harvest, /print/receipt — bounces to
 * /training. This is the ONE place that sees every navigation (server layouts
 * can't read the pathname), so the portal fence lives here; superuser-only
 * training subroutes (/training/new, /training/<id>/edit, /training/<id>/access,
 * /training/modules) additionally 404 at the page level for non-superusers.
 *  - /print/certificate: portal learners print their own certificates
 *  - /api/training/image: module/question images the course player loads
 *  - /api/scorm: SCO assets (HTML/JS/media) the SCORM player iframe fetches
 */
const PORTAL_ALLOWED = ["/training", "/print/certificate", "/api/training/image", "/api/scorm"];

function isPortalAllowed(pathname: string) {
  return PORTAL_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default auth((req) => {
  const { nextUrl } = req;
  if (isPublic(nextUrl.pathname)) return;
  if (!req.auth) {
    const url = nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Forced first-login password change: a temp-password student can reach
  // NOTHING except /set-password (and the auth endpoints / sign-out) until they
  // choose their own password. Checked before the PORTAL fence so it applies to
  // every role. The flag clears when the set-password/accept-invite flow
  // re-authenticates via signIn(), re-minting the JWT from the fresh DB value.
  if (
    req.auth.user?.mustChangePassword &&
    nextUrl.pathname !== "/set-password" &&
    !nextUrl.pathname.startsWith("/api/")
  ) {
    const url = nextUrl.clone();
    url.pathname = "/set-password";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // PORTAL logins see ONLY the education portal (plus /set-password while the
  // forced-change flag is set — handled above).
  if (
    req.auth.user?.role === "PORTAL" &&
    nextUrl.pathname !== "/set-password" &&
    !isPortalAllowed(nextUrl.pathname)
  ) {
    const url = nextUrl.clone();
    url.pathname = "/training";
    url.search = "";
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: [
    // Match everything except: /api/auth/*, /api/health (public for Railway
    // health-check), /api/uploads/* (handled inside the route via auth()),
    // /api/admin/upload-passthrough (bearer-token gated, used by the
    // sync-to-prod script — doesn't need a logged-in session), Next
    // internals, and static files.
    "/((?!api/auth|api/health|api/uploads|api/admin/upload-passthrough|api/items/.+/photo|api/customers/[^/]+/logo|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
