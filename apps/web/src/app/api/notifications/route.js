import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET(req) {
    var _a;
    const session = await auth();
    if (!((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.id)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get("unread") === "true";
    const notifications = await prisma.notification.findMany({
        where: Object.assign({ userId: session.user.id }, (unreadOnly ? { read: false } : {})),
        orderBy: { createdAt: "desc" },
        take: 50,
    });
    return NextResponse.json(notifications);
}
export async function PATCH(req) {
    var _a, _b;
    const session = await auth();
    if (!((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.id)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const ids = (_b = body.ids) !== null && _b !== void 0 ? _b : [];
    if (ids.length === 0) {
        // Mark all as read
        await prisma.notification.updateMany({
            where: { userId: session.user.id, read: false },
            data: { read: true },
        });
    }
    else {
        await prisma.notification.updateMany({
            where: { userId: session.user.id, id: { in: ids } },
            data: { read: true },
        });
    }
    return NextResponse.json({ ok: true });
}
