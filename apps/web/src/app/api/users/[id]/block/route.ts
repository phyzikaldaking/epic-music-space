import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";

/**
 * POST /api/users/[id]/block — toggle a block on the target user.
 * Returns: { blocked: boolean }
 *
 * Blocks are non-symmetric (A blocking B doesn't auto-block A from B's
 * side). Side effects: A's feed filters out posts authored by B, and
 * follow rows in either direction are torn down so neither party sees
 * the other in their following feed.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await strictLimiter.consume(`user-block:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { id: blockedId } = await params;
  if (blockedId === session.user.id) {
    return NextResponse.json(
      { error: "You can't block yourself." },
      { status: 400 },
    );
  }

  // Make sure the target exists — without this, callers can churn block rows
  // against random IDs to amplify writes.
  const target = await prisma.user.findUnique({
    where: { id: blockedId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existing = await prisma.userBlock.findUnique({
    where: {
      blockerId_blockedId: { blockerId: session.user.id, blockedId },
    },
  });

  if (existing) {
    await prisma.userBlock.delete({ where: { id: existing.id } });
    return NextResponse.json({ blocked: false });
  }

  await prisma.userBlock.create({
    data: { blockerId: session.user.id, blockedId },
  });

  // Tear down any follow edges in either direction — a block implies you
  // don't want to see them and they shouldn't be auto-following you either.
  await prisma.userFollow.deleteMany({
    where: {
      OR: [
        { followerId: session.user.id, followingId: blockedId },
        { followerId: blockedId, followingId: session.user.id },
      ],
    },
  });

  return NextResponse.json({ blocked: true });
}
