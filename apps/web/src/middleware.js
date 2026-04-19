import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
/**
 * Next.js Edge Middleware — route protection for EMS.
 *
 * Protected prefixes:
 *   /dashboard   – requires any authenticated session
 *   /studio/new  – requires ARTIST or LABEL or ADMIN role
 *
 * Unauthenticated users are redirected to /auth/signin with a `callbackUrl`
 * so they land back on the page they were trying to reach after signing in.
 */
export default auth((req) => {
    var _a, _b, _c;
    const { pathname } = req.nextUrl;
    const session = req.auth;
    const isAuthed = !!((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.id);
    // ── /dashboard — require authentication ────────────────────────────────────
    if (pathname.startsWith("/dashboard")) {
        if (!isAuthed) {
            const signIn = new URL("/auth/signin", req.url);
            signIn.searchParams.set("callbackUrl", pathname);
            return NextResponse.redirect(signIn);
        }
    }
    // ── /studio/new — require artist / label / admin ───────────────────────────
    if (pathname === "/studio/new") {
        if (!isAuthed) {
            const signIn = new URL("/auth/signin", req.url);
            signIn.searchParams.set("callbackUrl", pathname);
            return NextResponse.redirect(signIn);
        }
        // @ts-expect-error role is a custom JWT field
        const role = (_c = (_b = session === null || session === void 0 ? void 0 : session.user) === null || _b === void 0 ? void 0 : _b.role) !== null && _c !== void 0 ? _c : "LISTENER";
        if (role === "LISTENER") {
            return NextResponse.redirect(new URL("/dashboard", req.url));
        }
    }
    return NextResponse.next();
});
export const config = {
    matcher: ["/dashboard/:path*", "/studio/new"],
};
