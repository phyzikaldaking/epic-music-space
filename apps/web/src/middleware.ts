/**
 * Next.js edge middleware for Epic Music Space.
 *
 * Responsibilities:
 *  1. Auth-gate protected routes at the edge — unauthenticated visitors are
 *     redirected to /auth/signin before any server component even runs, so
 *     there's no flash of protected content and no unnecessary DB round-trips.
 *  2. Inject security headers on every HTML response (complements the CSP set
 *     in the server-side csp.ts helper).
 *
 * IMPORTANT: This file runs in the Edge runtime. Do NOT import anything that
 * requires Node.js built-ins (Prisma, bcrypt, fs, etc.).  Auth validation here
 * is intentionally cookie-only — a missing or expired token is handled
 * gracefully by the page-level auth() call once the user is allowed through.
 */

import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Cookie name matches lib/auth.ts cookie config (secure prefix in production).
// ---------------------------------------------------------------------------
const SESSION_COOKIE_DEV = "authjs.session-token";
const SESSION_COOKIE_PROD = "__Secure-authjs.session-token";

function isAuthenticated(req: NextRequest): boolean {
  // Check both names — handles localhost behind a local HTTPS proxy and
  // mixed dev/preview deploys that might have the wrong NODE_ENV set.
  return (
    !!req.cookies.get(SESSION_COOKIE_PROD)?.value ||
    !!req.cookies.get(SESSION_COOKIE_DEV)?.value
  );
}

// ---------------------------------------------------------------------------
// Route protection rules.
// Order matters: first match wins.
// ---------------------------------------------------------------------------

/**
 * Patterns that REQUIRE an authenticated session.
 * Unauthenticated requests are redirected to /auth/signin?callbackUrl=<href>.
 */
const REQUIRE_AUTH: RegExp[] = [
  // Admin panel (role check still happens inside the page)
  /^\/admin(\/|$)/,
  // Creator & business tools
  /^\/dashboard(\/|$)/,
  /^\/analytics(\/|$)/,
  /^\/ads(\/|$)/,
  /^\/boost(\/|$)/,
  /^\/creator(\/|$)/,
  // AI features
  /^\/ai(\/|$)/,
  // Studio — but NOT /studio/try (guest-accessible DAW demo)
  /^\/studio\/(?!try)(.*)/,
  // Social / account pages
  /^\/profile(\/|$)/,
  /^\/profile\/edit(\/|$)/,
  /^\/settings(\/|$)/,
  /^\/notifications(\/|$)/,
  /^\/messages(\/|$)/,
  /^\/library(\/|$)/,
  /^\/vault(\/|$)/,
  /^\/invite(\/|$)/,
  // Versus / battle pages that require a logged-in challenger
  /^\/versus\/new(\/|$)/,
  /^\/versus\/inbox(\/|$)/,
  /^\/versus\/history(\/|$)/,
  /^\/verzuz\/new(\/|$)/,
  /^\/verzuz\/challenge\/new(\/|$)/,
  // Rooms creation (listing/viewing is public)
  /^\/rooms\/new(\/|$)/,
  // Label & services management
  /^\/services\/new(\/|$)/,
];

/**
 * Patterns where an ALREADY-AUTHENTICATED user should be bounced away.
 * Avoids showing the sign-in / sign-up form to users who already have a
 * session (UX improvement, not a security requirement).
 */
const REDIRECT_IF_AUTHED: RegExp[] = [
  /^\/auth\/signin$/,
  /^\/auth\/signup$/,
];

// Where to send authed users who land on auth pages
const AUTHED_HOME = "/feed";
// Sign-in page path
const SIGN_IN_PATH = "/auth/signin";

// ---------------------------------------------------------------------------
// Security headers added to every HTML page response.
// The full Content-Security-Policy is built by lib/csp.ts on the server side;
// these headers are complementary hardening that can be applied at the edge.
// ---------------------------------------------------------------------------
const SECURITY_HEADERS: Record<string, string> = {
  // Prevent MIME-type sniffing
  "X-Content-Type-Options": "nosniff",
  // Disallow rendering in iframes (clickjacking protection)
  // Note: if you need iframes for embeds, switch to ALLOW-FROM or CSP frame-ancestors
  "X-Frame-Options": "SAMEORIGIN",
  // Reduce referer leakage across origins
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Lock down browser feature access
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), payment=()",
  // Disable the legacy XSS auditor (CSP does this better and the auditor causes bugs)
  "X-XSS-Protection": "0",
};

// ---------------------------------------------------------------------------
// Middleware entry point
// ---------------------------------------------------------------------------
export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // ------------------------------------------------------------------
  // 1. Auth protection
  // ------------------------------------------------------------------
  const authed = isAuthenticated(req);

  // Block unauthenticated access to protected routes
  const requiresAuth = REQUIRE_AUTH.some((pattern) => pattern.test(pathname));
  if (requiresAuth && !authed) {
    const signIn = new URL(SIGN_IN_PATH, req.url);
    // Preserve the originally-requested URL so we can redirect back after login
    signIn.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(signIn, { status: 307 });
  }

  // Bounce already-authed users away from auth pages
  if (!requiresAuth) {
    const isAuthPage = REDIRECT_IF_AUTHED.some((pattern) =>
      pattern.test(pathname),
    );
    if (isAuthPage && authed) {
      // Respect an explicit callbackUrl so e.g. email magic links still work
      const callbackUrl = req.nextUrl.searchParams.get("callbackUrl");
      const dest = callbackUrl
        ? callbackUrl
        : new URL(AUTHED_HOME, req.url).toString();
      return NextResponse.redirect(dest, { status: 307 });
    }
  }

  // ------------------------------------------------------------------
  // 2. Security headers on all non-redirected responses
  // ------------------------------------------------------------------
  const res = NextResponse.next();
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(header, value);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Matcher: run on all routes EXCEPT:
//   - /_next/static    (bundled JS/CSS — no middleware needed)
//   - /_next/image     (image optimiser)
//   - /favicon.ico, /robots.txt, /sitemap.xml (static assets)
//   - Any file with a common static extension
// ---------------------------------------------------------------------------
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|mp3|mp4|ogg|wav|flac)$).*)",
  ],
};
