import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/user/export-data
 *
 * Streams a JSON dump of every record we hold for the calling user. GDPR
 * Article 15 (Right of Access) + Article 20 (Data Portability) compliant.
 * The response is a single JSON document so the user can save it locally.
 *
 * Heavy queries are scoped to the user's own ids, not the entire table.
 * Rate-limited per user to once every couple of minutes.
 */
export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await strictLimiter.consume(`export:${session.user.id}`);
  } catch {
    return NextResponse.json(
      { error: "You can request a data export once every couple of minutes." },
      { status: 429, headers: { "Retry-After": "120" } },
    );
  }

  const userId = session.user.id;

  const [
    user,
    songs,
    licenses,
    transactions,
    payouts,
    posts,
    postComments,
    postLikes,
    follows,
    followers,
    badges,
    notifications,
    behaviorEvents,
    serviceListings,
    serviceOrdersAsBuyer,
    serviceOrdersAsProvider,
    supportTickets,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { studio: true, tasteProfile: true },
    }),
    prisma.song.findMany({ where: { artistId: userId } }),
    prisma.licenseToken.findMany({ where: { holderId: userId } }),
    prisma.transaction.findMany({ where: { userId } }),
    prisma.payout.findMany({ where: { userId } }),
    prisma.post.findMany({ where: { authorId: userId } }),
    prisma.postComment.findMany({ where: { authorId: userId } }),
    prisma.postLike.findMany({ where: { userId } }),
    prisma.userFollow.findMany({ where: { followerId: userId } }),
    prisma.userFollow.findMany({ where: { followingId: userId } }),
    prisma.userBadge.findMany({ where: { userId } }),
    prisma.notification.findMany({ where: { userId } }),
    prisma.userBehaviorEvent.findMany({ where: { userId }, take: 5000, orderBy: { createdAt: "desc" } }),
    prisma.serviceListing.findMany({ where: { providerId: userId } }),
    prisma.serviceOrder.findMany({ where: { buyerId: userId } }),
    prisma.serviceOrder.findMany({ where: { providerId: userId } }),
    prisma.supportTicket.findMany({ where: { userId } }),
  ]);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Strip the password hash even from the user's own export — they don't
  // need it to "port their data," and removing it lowers the blast radius
  // if the file ever leaks.
  const { passwordHash: _ph, ...safeUser } = user;
  void _ph;

  const payload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    user: safeUser,
    songs,
    licenses,
    transactions,
    payouts,
    posts,
    postComments,
    postLikes,
    following: follows,
    followers,
    badges,
    notifications,
    behaviorEvents,
    serviceListings,
    serviceOrdersAsBuyer,
    serviceOrdersAsProvider,
    supportTickets,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ems-export-${userId}-${Date.now()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
