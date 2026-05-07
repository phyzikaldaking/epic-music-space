import { NextRequest, NextResponse } from "next/server";
import { buildContentSecurityPolicy } from "@/lib/csp";

/**
 * Next.js proxy — route protection for EMS.
 *
 * Auth wall: anonymous users are redirected to /auth/signin from every page
 * except a small set of public routes (auth flows, legal, static, marketing).
 * Server pages and API routes still perform the authoritative auth/role
 * checks; proxy only handles fast redirects.
 */

const PUBLIC_PATHS = [
  "/auth",
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
  "/studio",
  "/track",
  "/pro",
  "/u",
  "/marketplace",
  "/search",
  "/versus",
  "/rooms",
  "/forum",
  "/services",
  "/share",
];

const PUBLIC_EXACT = new Set<string>(["/"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(req: NextRequest) {
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

  if (pathname.startsWith("/api/stripe-connect")) {
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return nextResponse();
  }

  if (pathname.startsWith("/api/")) return nextResponse();

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
  const sessionCookies = [
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
  ];

  for (const name of sessionCookies) {
    const cookie = req.cookies.get(name);
    if (cookie?.value) return true;
  }
  return false;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|woff2|ttf|otf|map)$).*)",
  ],
};