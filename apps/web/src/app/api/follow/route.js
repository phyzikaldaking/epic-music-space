import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
const schema = z.object({
    targetUserId: z.string().cuid(),
    action: z.enum(["follow", "unfollow"]),
});
export async function POST(req) {
    var _a, _b;
    const session = await auth();
    if (!((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.id)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: (_b = parsed.error.issues[0]) === null || _b === void 0 ? void 0 : _b.message }, { status: 400 });
    }
    const { targetUserId, action } = parsed.data;
    if (targetUserId === session.user.id) {
        return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
    }
    if (action === "follow") {
        await prisma.userFollow.upsert({
            where: {
                followerId_followingId: {
                    followerId: session.user.id,
                    followingId: targetUserId,
                },
            },
            create: { followerId: session.user.id, followingId: targetUserId },
            update: {},
        });
    }
    else {
        await prisma.userFollow.deleteMany({
            where: { followerId: session.user.id, followingId: targetUserId },
        });
    }
    const followerCount = await prisma.userFollow.count({
        where: { followingId: targetUserId },
    });
    return NextResponse.json({ action, followerCount });
}
