import { NextRequest, NextResponse } from "next/server";
import { buildContentSecurityPolicy } from "@/lib/csp";
import { sanitizeCallbackPath } from "@/lib/safeCallback";

const SESSION_COOKIE_DEV = "authjs.session-token";
const SESSION_COOKIE_PROD = "__Secure-authjs.session-token";
const AUTHED_HOME = "/feed";
const SIGN_IN_PATH = "/auth/signin";

const REQUIRE_AUTH: RegExp[] = [
  /^\/admin(\/|$)/,
  /^\/dashboard(\/|$)/,
  /^\/analytics(\/|$)/,
  /^\/ads(\/|$)/,
  /^\/boost(\/|$)/,
  /^\/creator(\/|$)/,
  /^\/ai(\/|$)/,
  /^\/studio\/(?!try(?:\/|$)|ultra(?:\/|$))(.*)/,
  /^\/profile(\/|$)/,
  /^\/profile\/edit(\/|$)/,
  /^\/settings(\/|$)/,
  /^\/notifications(\/|$)/,
  /^\/messages(\/|$)/,
  /^\/library(\/|$)/,
  /^\/vault(\/|$)/,
  /^\/invite(\/|$)/,
  /^\/versus\/new(\/|$)/,
  /^\/versus\/inbox(\/|$)/,
  /^\/versus\/history(\/|$)/,
  /^\/verzuz\/new(\/|$)/,
  /^\/verzuz\/challenge\/new(\/|$)/,
  /^\/rooms\/new(\/|$)/,
  /^\/services\/new(\/|$)/,
];

const REDIRECT_IF_AUTHED: RegExp[] = [/^\/auth\/signin$/, /^\/auth\/signup$/];

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(self), payment=()",
  "X-XSS-Protection": "0",
};

function isAuthenticated(req: NextRequest): boolean {
  return Boolean(req.cookies.get(SESSION_COOKIE_PROD)?.value || req.cookies.get(SESSION_COOKIE_DEV)?.value);
}

function shouldAttachCsp(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/_next/")) return false;
  if (["/favicon.ico", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/opengraph-image", "/icon"].includes(pathname)) return false;
  if (pathname.startsWith("/icon/")) return false;
  if (pathname.includes(".")) return false;
  return true;
}

export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const authed = isAuthenticated(req);

  if (pathname.startsWith("/api/stripe-connect")) {
    if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const requiresAuth = REQUIRE_AUTH.some((pattern) => pattern.test(pathname));
  if (requiresAuth && !authed) {
    const signIn = new URL(SIGN_IN_PATH, req.url);
    signIn.searchParams.set(
      "callbackUrl",
      `${req.nextUrl.pathname}${req.nextUrl.search}`,
    );
    return NextResponse.redirect(signIn, { status: 307 });
  }

  if (!requiresAuth && REDIRECT_IF_AUTHED.some((pattern) => pattern.test(pathname)) && authed) {
    const rawCallback = req.nextUrl.searchParams.get("callbackUrl");
    const safePath = sanitizeCallbackPath(rawCallback, AUTHED_HOME);
    return NextResponse.redirect(new URL(safePath, req.url).toString(), { status: 307 });
  }

  const attachCsp = shouldAttachCsp(pathname);
  const requestHeaders = new Headers(req.headers);
  let nonce: string | null = null;
  if (attachCsp) {
    nonce = crypto.randomUUID().replaceAll("-", "");
    requestHeaders.set("x-nonce", nonce);
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  const isEmbedPath = /\/embed(\/|$)/.test(pathname);
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    if (isEmbedPath && header === "X-Frame-Options") continue;
    res.headers.set(header, value);
  }
  if (attachCsp && nonce) {
    res.headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce, undefined, { allowEmbed: isEmbedPath }));
  }
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|mp3|mp4|ogg|wav|flac)$).*)",
  ],
};
