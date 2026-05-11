import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// List the users the caller is currently following — used by the
// studio's "DM clip to a follower" picker. We keep it auth-only +
// limit to 200 entries so a producer with a huge follow graph still
// gets a fast response. The DM endpoint enforces its own validation
// when sending; this route just feeds the picker.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const follows = await prisma.userFollow.findMany({
    where: { followerId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      following: {
        select: { id: true, name: true, username: true, image: true },
      },
    },
  });

  return NextResponse.json({
    users: follows.map((f) => f.following),
  });
}
