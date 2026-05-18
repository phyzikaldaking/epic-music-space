import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { nextUrl } = request;

  if (nextUrl.pathname === "/studio/try" && nextUrl.searchParams.get("from") !== "enter") {
    const enterUrl = new URL("/enter", request.url);
    return NextResponse.redirect(enterUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/studio/try"],
};
