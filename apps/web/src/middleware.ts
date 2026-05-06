import { NextRequest, NextResponse } from "next/server";
import { buildContentSecurityPolicy } from "@/lib/csp";

/**
 * Next.js Edge Middleware - route protection for EMS.
 *
 * Keep this file Edge-safe. Server pages and API routes perform the
 * authoritative auth/role checks; middleware only handles fast redirects for
 * obviously signed-out requests.
 */
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
    signIn.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signIn);
  }

  if (pathname.startsWith("/api/stripe-connect")) {
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return nextResponse();
  }

  const protectedPrefixes = [
    "/dashboard",
    "/boost",
    "/analytics",
    "/profile",
    "/invite",
    "/notifications",
    "/admin",
    "/label",
    "/studio/new",
    "/versus/new",
  ];

  if (protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    if (!isAuthed) return redirectToSignIn();
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
  matcher: [
    "/dashboard/:path*",
    "/boost/:path*",
    "/analytics/:path*",
    "/studio/new",
    "/versus/new",
    "/label/:path*",
    "/profile/:path*",
    "/invite/:path*",
    "/notifications/:path*",
    "/admin/:path*",
    "/api/stripe-connect/:path*",
  ],
};
