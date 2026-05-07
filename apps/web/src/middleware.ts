import { NextRequest, NextResponse } from "next/server";
import { buildContentSecurityPolicy } from "@/lib/csp";

/**
 * Next.js Edge Middleware — route protection for EMS.
 *
 * Auth wall: anonymous users are redirected to /auth/signin from every page
 * except a small set of public routes (auth flows, legal, static, marketing).
 * Server pages and API routes still perform the authoritative auth/role
 * checks; middleware only handles fast redirects.
 */

// Routes anonymous users CAN reach. Everything else requires sign-in.
const PUBLIC_PATHS = [
  "/auth",                  // signin, signup, verify-email, reset-password, error
  "/legal",
  "/privacy",
  "/terms",
  "/license-agreement",
  "/dmca",
  "/trust",
  "/get-the-app",
  "/investors",
  "/pricing",
  "/support",
  "/status",
  "/sitemap.xml",
  "/robots.txt",
];

// Public PAGES (exact match only, not prefixes — keeps marketing/landing open
// without exposing /search, /marketplace, etc.)
const PUBLIC_EXACT = new Set<string>([
  "/welcome",
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAuthed = hasSessionCookie(req);
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  function nextResponse() {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    if (shouldAttachCsp(pathname)) {
      res.headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));
    }
    return res;
  }

  function redirectToSignIn() {
    const signIn = new URL("/auth/signin", req.url);
    signIn.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
    return NextResponse.redirect(signIn);
  }

  // API auth checks first
  if (pathname.startsWith("/api/stripe-connect")) {
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return nextResponse();
  }

  // API routes carry their own auth. Middleware only handles HTML pages.
  if (pathname.startsWith("/api/")) return nextResponse();

  // Static / framework assets
  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".txt")
  ) {
    return nextResponse();
  }

  // The auth wall: signed-out users can ONLY reach public paths.
  if (!isAuthed && !isPublicPath(pathname)) {
    return redirectToSignIn();
  }

  return nextResponse();
}

function shouldAttachCsp(pathname: string) {
  return !(
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname.includes(".")
  );
}

function hasSessionCookie(req: NextRequest) {
  return [
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
  ].some((name) => Boolean(req.cookies.get(name)?.value));
}

export const config = {
  // Run on every request EXCEPT internal Next.js paths and obvious static files.
  // The function above does the public-vs-protected sorting.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|woff2|ttf|otf|map)$).*)",
  ],
};
