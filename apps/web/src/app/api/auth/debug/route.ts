import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Anonymous self-diagnostic endpoint for "I can't log in" reports.
// Returns the minimum signal needed to triage:
//  - Is the session cookie present?
//  - Which cookie name (secure vs. dev prefix)?
//  - Does NextAuth recognize the session server-side?
//  - What hostname is the request reaching us with?
//
// Safe to expose: returns no PII beyond what the user already has access
// to (their own session info, their own user-agent). If unauthenticated,
// only environmental signal is returned. Useful for: "open this URL on
// the device that won't log in and paste the JSON to support."

const SESSION_COOKIE_PROD = "__Secure-authjs.session-token";
const SESSION_COOKIE_DEV = "authjs.session-token";

export async function GET(req: NextRequest) {
  const session = await auth();
  const cookieProd = req.cookies.get(SESSION_COOKIE_PROD)?.value ?? null;
  const cookieDev = req.cookies.get(SESSION_COOKIE_DEV)?.value ?? null;
  // We don't return cookie values — that would leak the JWT. Just
  // booleans + lengths so the user can see "yes, the cookie was set;
  // it's just not the right name for this environment."
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    session: session
      ? {
          authenticated: true,
          userId: session.user?.id ?? null,
          email: session.user?.email ?? null,
        }
      : { authenticated: false },
    cookies: {
      hasSecureSessionCookie: Boolean(cookieProd),
      hasDevSessionCookie: Boolean(cookieDev),
      // Length is a passive sanity check — a near-empty cookie usually
      // means it was set by a different host and then sanitized down.
      secureCookieLength: cookieProd ? cookieProd.length : 0,
      devCookieLength: cookieDev ? cookieDev.length : 0,
    },
    request: {
      host: req.headers.get("host") ?? null,
      forwardedHost: req.headers.get("x-forwarded-host") ?? null,
      forwardedProto: req.headers.get("x-forwarded-proto") ?? null,
      // Helps diagnose "third-party cookies blocked" — Safari strict
      // mode and some corporate proxies strip cookies on third-party
      // navigations even when SameSite=Lax should allow them.
      userAgent: req.headers.get("user-agent") ?? null,
      origin: req.headers.get("origin") ?? null,
      // Detects sec-fetch-site=cross-site, which Safari uses to make
      // cookie-handling decisions in some ITP modes.
      secFetchSite: req.headers.get("sec-fetch-site") ?? null,
    },
    environment: {
      nodeEnv: process.env.NODE_ENV ?? null,
      // Don't leak the actual values — just whether they're configured.
      authUrlConfigured: Boolean(process.env.AUTH_URL || process.env.NEXTAUTH_URL),
      authSecretConfigured: Boolean(
        process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
      ),
      googleConfigured: Boolean(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
      ),
      appleConfigured: Boolean(
        process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET,
      ),
    },
  });
}
