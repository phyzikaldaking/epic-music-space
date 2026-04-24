import { NextRequest, NextResponse } from "next/server";

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

  function redirectToSignIn() {
    const signIn = new URL("/auth/signin", req.url);
    signIn.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signIn);
  }

  if (pathname.startsWith("/api/stripe-connect")) {
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  const protectedPrefixes = [
    "/dashboard",
    "/boost",
    "/analytics",
    "/profile",
    "/invite",
    "/notifications",
  ];

  if (protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    if (!isAuthed) return redirectToSignIn();
  }

  if (pathname === "/studio/new") {
    if (!isAuthed) return redirectToSignIn();
  }

  return NextResponse.next();
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
    "/profile/:path*",
    "/invite/:path*",
    "/notifications/:path*",
    "/api/stripe-connect/:path*",
  ],
};
