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
import { buildContentSecurityPolicy } from "@/lib/csp";
import { sanitizeCallbackPath } from "@/lib/safeCallback";

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

/**
 * Decide if this path should get a Content-Security-Policy header.
 * Skip CSP for API routes, Next internals, and pure-asset paths — the
 * header is only meaningful for HTML responses, and attaching it
 * everywhere just bloats response sizes for no benefit.
 */
function shouldAttachCsp(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/_next/")) return false;
  // Static metadata files. `/icon` is the Next.js convention for the
  // app icon route that may or may not have an extension; covered here.
  if (
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/opengraph-image" ||
    pathname === "/icon" ||
    pathname.startsWith("/icon/")
  ) {
    return false;
  }
  // Anything with a file extension (images, fonts, etc.)
  if (pathname.includes(".")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Middleware entry point
// ---------------------------------------------------------------------------
export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const authed = isAuthenticated(req);

  // ------------------------------------------------------------------
  // 1a. Stripe Connect API: gate at the edge with a 401 instead of a
  //     redirect. Card-on-file flows can't follow a 307 to /auth/signin
  //     in the way HTML pages can, so the right answer for an
  //     unauthenticated request to a sensitive API is a JSON 401.
  //     Other /api/* paths bypass the redirect logic entirely; those
  //     handlers do their own auth checks.
  // ------------------------------------------------------------------
  if (pathname.startsWith("/api/stripe-connect")) {
    if (!authed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // ------------------------------------------------------------------
  // 1b. Auth-gated HTML pages
  // ------------------------------------------------------------------
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
      // Respect an explicit callbackUrl so e.g. email magic links still work,
      // but always resolve to an absolute URL — NextResponse.redirect calls
      // `new URL(dest)` internally, and a bare path like "/ai" throws "URL
      // is malformed" → 500. sanitizeCallbackPath also blocks open-redirects
      // by requiring same-origin paths.
      const rawCallback = req.nextUrl.searchParams.get("callbackUrl");
      const safePath = sanitizeCallbackPath(rawCallback, AUTHED_HOME);
      const dest = new URL(safePath, req.url).toString();
      return NextResponse.redirect(dest, { status: 307 });
    }
  }

  // ------------------------------------------------------------------
  // 2. CSP nonce + content security policy.
  //
  // CRITICAL: the layout reads `x-nonce` from request headers via
  // `headers().get("x-nonce")` and applies it to inline <script> tags.
  // With CSP's 'strict-dynamic' active, those nonced scripts are what
  // anchor the trust chain that authorizes Next.js's RSC flight scripts
  // to load the rest of the JS chunks. Skipping the nonce header here
  // (or removing the layout's read) breaks hydration silently — page
  // SSRs fine, no JS executes. This regression has shipped THREE times
  // before; if you're "cleaning up" middleware, see the synthetic-smoke
  // cron's `synthetic:csp:scripts-not-nonced` fingerprint first.
  // ------------------------------------------------------------------
  const attachCsp = shouldAttachCsp(pathname);
  const requestHeaders = new Headers(req.headers);
  let nonce: string | null = null;
  if (attachCsp) {
    nonce = crypto.randomUUID().replaceAll("-", "");
    requestHeaders.set("x-nonce", nonce);
  }

  // ------------------------------------------------------------------
  // 3. Security headers on all non-redirected responses
  // ------------------------------------------------------------------
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(header, value);
  }
  if (attachCsp && nonce) {
    res.headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));
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
