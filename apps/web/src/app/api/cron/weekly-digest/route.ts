import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWeeklyDigestEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Weekly digest cron — Friday morning. Emails every artist (non-LISTENER)
 * with email_verified set a 7-day recap of new followers, licenses sold,
 * gross, plays, and their top track.
 *
 * Skipped artists with no email or who haven't done anything in the last 30
 * days (so dormant accounts don't get noise). Silent weeks for low-activity
 * artists are coalesced — they get a recap once every 4 weeks regardless.
 */
const BATCH = 200;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authed = secret && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since7 = new Date(Date.now() - SEVEN_DAYS);
  const since30 = new Date(Date.now() - THIRTY_DAYS);

  const artists = await prisma.user.findMany({
    where: {
      role: { not: "LISTENER" },
      emailVerified: { not: null },
      songs: { some: { isActive: true, OR: [{ updatedAt: { gte: since30 } }, { createdAt: { gte: since30 } }] } },
    },
    select: { id: true, email: true, name: true },
    take: BATCH,
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const a of artists) {
    if (!a.email) {
      skipped += 1;
      continue;
    }

    const [followersDelta, licensesSold, grossAgg, playsAgg, topTrackRow] = await Promise.all([
      prisma.userFollow.count({ where: { followingId: a.id, createdAt: { gte: since7 } } }),
      prisma.licenseToken.count({ where: { song: { artistId: a.id }, purchasedAt: { gte: since7 } } }),
      prisma.licenseToken.aggregate({
        _sum: { price: true },
        where: { song: { artistId: a.id }, purchasedAt: { gte: since7 } },
      }),
      prisma.userBehaviorEvent
        .count({
          where: { song: { artistId: a.id }, eventType: "view", createdAt: { gte: since7 } },
        })
        .catch(() => 0),
      prisma.userBehaviorEvent
        .groupBy({
          by: ["songId"],
          where: { song: { artistId: a.id }, eventType: "view", createdAt: { gte: since7 } },
          _count: { songId: true },
        })
        .catch(() => [] as Array<{ songId: string | null; _count: { songId: number } }>),
    ]);

    // Sort in JS — Prisma groupBy's orderBy doesn't accept _count.songId
    // ergonomically across versions, and we only need the top one.
    const topRow = [...topTrackRow]
      .sort((a, b) => (b._count?.songId ?? 0) - (a._count?.songId ?? 0))[0];

    let topTrackTitle: string | null = null;
    let topTrackPlays = 0;
    if (topRow?.songId) {
      topTrackPlays = topRow._count?.songId ?? 0;
      const song = await prisma.song.findUnique({
        where: { id: topRow.songId },
        select: { title: true, artistId: true },
      });
      if (song?.artistId === a.id) topTrackTitle = song.title;
    }

    const noActivity =
      followersDelta === 0 && licensesSold === 0 && playsAgg === 0;
    const fourWeekly = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) % 4 === 0;
    if (noActivity && !fourWeekly) {
      skipped += 1;
      continue;
    }

    try {
      const result = await sendWeeklyDigestEmail({
        to: a.email,
        artistName: a.name ?? "there",
        newFollowers: followersDelta,
        licensesSold,
        grossDollars: Number(grossAgg._sum.price ?? 0),
        topTrackTitle,
        topTrackPlays,
        totalPlays: playsAgg,
      });
      if (result.ok) sent += 1;
      else failed += 1;
    } catch (err) {
      console.error("[weekly-digest] send failed", { userId: a.id, err });
      failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    processed: artists.length,
    sent,
    skipped,
    failed,
  });
}
