import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js Edge Middleware - route protection for EMS.
 *
 * Middleware must stay Edge-safe, so it reads the JWT directly instead of
 * importing the Prisma-backed NextAuth adapter.
 */
export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  });

  const isAuthed = !!(token?.sub ?? token?.id);

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
  ];

  if (protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    if (!isAuthed) return redirectToSignIn();
  }

  if (pathname === "/studio/new") {
    if (!isAuthed) return redirectToSignIn();
    const role = String(token?.role ?? "LISTENER");
    if (role === "LISTENER") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/boost/:path*",
    "/analytics/:path*",
    "/studio/new",
    "/profile/:path*",
    "/invite/:path*",
    "/api/stripe-connect/:path*",
  ],
};
