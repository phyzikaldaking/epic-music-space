import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { calculateAiScore, scoreToDistrict } from "@/lib/scoring";
import { moderateLimiter } from "@/lib/rateLimit";
import { enqueueAnalytics, enqueueNotification } from "@/lib/queues";
import { createServerSupabaseClient, CHANNELS } from "@/lib/supabase";
import { CACHE_TAGS } from "@/lib/cacheTags";
import { recordRiskEvent } from "@/lib/riskEvents";

interface Params {
  params: Promise<{ id: string }>;
}

const voteSchema = z.object({
  votedSongId: z.string().cuid(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await moderateLimiter.consume(ip);
  } catch {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: matchId } = await params;

  // Anti-fraud: per-IP-per-match throttle. Defends against brigading where
  // many sockpuppet accounts churn votes from one egress IP. The
  // unique-vote constraint still prevents duplicate counts per user.
  try {
    await moderateLimiter.consume(`versus-vote:${ip}:${matchId}`);
  } catch {
    await recordRiskEvent({
      eventType: "fake_vote",
      severity: "MEDIUM",
      actorUserId: session.user.id,
      ip,
      reason: "versus_vote_ip_rate_limited",
      metadata: { matchId },
    });
    return NextResponse.json(
      { error: "Too many vote attempts on this match from your network. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  const body = await req.json();
  const parsed = voteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid votedSongId" }, { status: 400 });
  }

  const { votedSongId } = parsed.data;

  const match = await prisma.versusMatch.findUnique({
    where: { id: matchId },
    include: {
      songA: { select: { artistId: true } },
      songB: { select: { artistId: true } },
    },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  // Prevent artists from voting on their own battles
  if (
    match.songA.artistId === session.user.id ||
    match.songB.artistId === session.user.id
  ) {
    return NextResponse.json(
      { error: "Artists cannot vote on battles featuring their own songs." },
      { status: 403 }
    );
  }

  if (match.status === "COMPLETED") {
    return NextResponse.json({ error: "This match has ended." }, { status: 409 });
  }
  if (match.endsAt < new Date()) {
    // Auto-close the match
    await prisma.versusMatch.update({
      where: { id: matchId },
      data: { status: "COMPLETED" },
    });
    return NextResponse.json({ error: "This match has ended." }, { status: 409 });
  }
  if (votedSongId !== match.songAId && votedSongId !== match.songBId) {
    return NextResponse.json({ error: "votedSongId must be one of the two songs in this match." }, { status: 400 });
  }

  // Single transaction: vote upsert + recount + match update + score recompute.
  // Both songs fetched in one findMany (was 2 sequential findUniques);
  // both score updates happen inside the same tx so a vote either fully
  // applies or fully rolls back.
  const updated = await prisma.$transaction(async (tx) => {
    await tx.versusVote.upsert({
      where: { matchId_userId: { matchId, userId: session.user.id } },
      create: { matchId, userId: session.user.id, votedSongId },
      update: { votedSongId },
    });

    const [votesA, votesB] = await Promise.all([
      tx.versusVote.count({ where: { matchId, votedSongId: match.songAId } }),
      tx.versusVote.count({ where: { matchId, votedSongId: match.songBId } }),
    ]);

    const matchRow = await tx.versusMatch.update({
      where: { id: matchId },
      data: { votesA, votesB },
    });

    const songs = await tx.song.findMany({
      where: { id: { in: [match.songAId, match.songBId] } },
    });

    for (const song of songs) {
      const score = calculateAiScore({
        soldLicenses: song.soldLicenses,
        totalLicenses: song.totalLicenses,
        streamCount: song.streamCount,
        versusWins: song.versusWins,
        versusLosses: song.versusLosses,
        aiSentiment: 0.5,
        boostScore: song.boostScore,
        createdAt: song.createdAt,
      });
      await tx.song.update({
        where: { id: song.id },
        data: { aiScore: score, district: scoreToDistrict(score) },
      });
    }

    return matchRow;
  });

  // Vote shifted scores — bust homepage / track / battles caches.
  revalidateTag(CACHE_TAGS.songs);
  revalidateTag(CACHE_TAGS.battles);
  revalidateTag(CACHE_TAGS.homepage);

  // Track vote event
  await enqueueAnalytics({
    event: "versus_vote",
    userId: session.user.id,
    songId: votedSongId,
    metadata: { matchId },
    timestamp: new Date().toISOString(),
  });

  // Notify the voted-for artist — once per day per match so a viral
  // battle doesn't spam them with one ping per voter. Best-effort,
  // never blocks the response.
  const votedArtistId =
    votedSongId === match.songAId ? match.songA.artistId : match.songB.artistId;
  if (votedArtistId !== session.user.id) {
    void (async () => {
      try {
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        const recent = await prisma.notification.findFirst({
          where: {
            userId: votedArtistId,
            type: "VERSUS_VOTE",
            createdAt: { gt: new Date(Date.now() - ONE_DAY_MS) },
            metadata: { path: ["matchId"], equals: matchId },
          },
          select: { id: true },
        });
        if (recent) return;
        await enqueueNotification({
          userId: votedArtistId,
          type: "VERSUS_VOTE",
          title: "Your battle is heating up 🔥",
          body: `Fans are voting on your track — current score is ${updated.votesA} vs ${updated.votesB}. Tap to watch live.`,
          metadata: { matchId, songId: votedSongId },
        });
      } catch (err) {
        console.warn("[versus:vote] notify failed", err);
      }
    })();
  }

  // Broadcast real-time vote update via Supabase
  const supabase = createServerSupabaseClient();
  if (supabase) {
    await Promise.allSettled([
      supabase.channel(CHANNELS.versus(matchId)).send({
        type: "broadcast",
        event: "vote_update",
        payload: { matchId, votesA: updated.votesA, votesB: updated.votesB },
      }),
      // Notify leaderboard listeners that scores changed
      supabase.channel(CHANNELS.leaderboard).send({
        type: "broadcast",
        event: "scores_updated",
        payload: { songAId: match.songAId, songBId: match.songBId },
      }),
    ]);
  }

  return NextResponse.json({ votesA: updated.votesA, votesB: updated.votesB });
}
