import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";
import { z } from "zod";
import { sendArtistMilestoneEmail } from "@/lib/email";

const schema = z.object({
  targetUserId: z.string().cuid(),
  action: z.enum(["follow", "unfollow"]),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await rateLimit("moderate", `follow:${session.user.id}`);
  if (blocked) return blocked;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { targetUserId, action } = parsed.data;

  if (targetUserId === session.user.id) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
  }

  // Verify the target actually exists before creating a follow record.
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Refuse follows in either direction if a block is in place. Unfollows
  // are still allowed (they only tear down state, never create it) so a
  // user who blocks you can't trap a stale follow row.
  if (action === "follow") {
    const block = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: session.user.id, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: session.user.id },
        ],
      },
      select: { id: true },
    });
    if (block) {
      return NextResponse.json(
        { error: "You can't follow this user." },
        { status: 403 },
      );
    }
  }

  if (action === "follow") {
    const priorCount = await prisma.userFollow.count({
      where: { followingId: targetUserId },
    });
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

    // First-follower milestone email — only when target had zero followers.
    if (priorCount === 0) {
      void (async () => {
        try {
          const [target, follower] = await Promise.all([
            prisma.user.findUnique({ where: { id: targetUserId }, select: { email: true, name: true, role: true } }),
            prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true } }),
          ]);
          if (target?.email && target.role !== "LISTENER") {
            await sendArtistMilestoneEmail({
              to: target.email,
              artistName: target.name ?? "there",
              kind: "first_follower",
              followerName: follower?.name ?? "Someone",
            });
          }
        } catch (err) {
          console.warn("[follow] first-follower email failed", err);
        }
      })();
    }
  } else {
    await prisma.userFollow.deleteMany({
      where: { followerId: session.user.id, followingId: targetUserId },
    });
  }

  const followerCount = await prisma.userFollow.count({
    where: { followingId: targetUserId },
  });

  return NextResponse.json({ action, followerCount });
}
