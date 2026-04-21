import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { calculateAiScore, scoreToDistrict } from "@/lib/scoring";
import { moderateLimiter } from "@/lib/rateLimit";
import { enqueueAnalytics } from "@/lib/queues";
import { createServerSupabaseClient, CHANNELS } from "@/lib/supabase";
import { awardBadge } from "@/lib/badges";

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
  const body = await req.json();
  const parsed = voteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid votedSongId" }, { status: 400 });
  }

  const { votedSongId } = parsed.data;

  const match = await prisma.versusMatch.findUnique({ where: { id: matchId } });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.status === "COMPLETED") {
    return NextResponse.json({ error: "This match has ended." }, { status: 409 });
  }
  if (match.endsAt < new Date()) {
    // Auto-close the match and finalise stats
    await finaliseMatch(matchId, match.songAId, match.songBId, match.votesA, match.votesB);
    return NextResponse.json({ error: "This match has ended." }, { status: 409 });
  }
  if (votedSongId !== match.songAId && votedSongId !== match.songBId) {
    return NextResponse.json({ error: "votedSongId must be one of the two songs in this match." }, { status: 400 });
  }

  // Upsert vote (users can change their vote)
  await prisma.versusVote.upsert({
    where: { matchId_userId: { matchId, userId: session.user.id } },
    create: { matchId, userId: session.user.id, votedSongId },
    update: { votedSongId },
  });

  // Recount votes
  const [votesA, votesB] = await Promise.all([
    prisma.versusVote.count({ where: { matchId, votedSongId: match.songAId } }),
    prisma.versusVote.count({ where: { matchId, votedSongId: match.songBId } }),
  ]);

  const updated = await prisma.versusMatch.update({
    where: { id: matchId },
    data: { votesA, votesB },
  });

  // Update AI scores for both songs after vote change
  const [songA, songB] = await Promise.all([
    prisma.song.findUnique({ where: { id: match.songAId } }),
    prisma.song.findUnique({ where: { id: match.songBId } }),
  ]);

  if (songA) {
    const score = calculateAiScore({
      soldLicenses: songA.soldLicenses,
      totalLicenses: songA.totalLicenses,
      streamCount: songA.streamCount,
      versusWins: songA.versusWins,
      versusLosses: songA.versusLosses,
      aiSentiment: 0.5,
      createdAt: songA.createdAt,
    });
    await prisma.song.update({
      where: { id: match.songAId },
      data: { aiScore: score, district: scoreToDistrict(score) },
    });
  }
  if (songB) {
    const score = calculateAiScore({
      soldLicenses: songB.soldLicenses,
      totalLicenses: songB.totalLicenses,
      streamCount: songB.streamCount,
      versusWins: songB.versusWins,
      versusLosses: songB.versusLosses,
      aiSentiment: 0.5,
      createdAt: songB.createdAt,
    });
    await prisma.song.update({
      where: { id: match.songBId },
      data: { aiScore: score, district: scoreToDistrict(score) },
    });
  }

  // Track vote event
  await enqueueAnalytics({
    event: "versus_vote",
    userId: session.user.id,
    songId: votedSongId,
    metadata: { matchId },
    timestamp: new Date().toISOString(),
  });

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

// ─────────────────────────────────────────────────────────
// Shared finalisation — marks a match COMPLETED, updates
// versusWins / versusLosses on both songs, and awards the
// FIRST_BATTLE_WIN badge to the winning artist.
// Safe to call multiple times (idempotent via status check).
// ─────────────────────────────────────────────────────────
export async function finaliseMatch(
  matchId: string,
  songAId: string,
  songBId: string,
  votesA: number,
  votesB: number,
) {
  // Mark completed (ignore if already done)
  await prisma.versusMatch.updateMany({
    where: { id: matchId, status: "ACTIVE" },
    data: { status: "COMPLETED" },
  });

  const winnerSongId = votesA >= votesB ? songAId : songBId;
  const loserSongId  = winnerSongId === songAId ? songBId : songAId;

  // Update win/loss counters on both songs
  await Promise.all([
    prisma.song.update({
      where: { id: winnerSongId },
      data: { versusWins: { increment: 1 } },
    }),
    prisma.song.update({
      where: { id: loserSongId },
      data: { versusLosses: { increment: 1 } },
    }),
  ]);

  // Award FIRST_BATTLE_WIN badge to the winning song's artist
  const winner = await prisma.song.findUnique({
    where: { id: winnerSongId },
    select: { artistId: true },
  });
  if (winner) {
    await awardBadge(winner.artistId, "FIRST_BATTLE_WIN");
  }
}
