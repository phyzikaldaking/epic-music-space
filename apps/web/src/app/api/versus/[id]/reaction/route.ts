import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter } from "@/lib/rateLimit";
import { enqueueAnalytics } from "@/lib/queues";
import { getRedis } from "@/lib/redis";
import { createServerSupabaseClient, CHANNELS } from "@/lib/supabase";

const schema = z.object({
  songId: z.string().cuid(),
  emoji: z.enum(["🔥", "🎯", "🧠", "🥶", "💥"]),
});

const EMOJIS = ["🔥", "🎯", "🧠", "🥶", "💥"] as const;
const REACTION_TTL_SECONDS = 7 * 24 * 60 * 60;

function reactionKey(matchId: string, songId: string) {
  return `ems:versus:reactions:${matchId}:${songId}`;
}

function normalizeCounts(raw: Record<string, string>) {
  return Object.fromEntries(
    EMOJIS.map((emoji) => [emoji, Number(raw[emoji] ?? 0)]),
  ) as Record<(typeof EMOJIS)[number], number>;
}

async function getSongCounts(matchId: string, songId: string) {
  const redis = getRedis();
  if (!redis) {
    return normalizeCounts({});
  }
  const raw = await redis.hgetall(reactionKey(matchId, songId));
  return normalizeCounts(raw);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: matchId } = await params;

  const match = await prisma.versusMatch.findUnique({
    where: { id: matchId },
    select: { id: true, songAId: true, songBId: true },
  });
  if (!match) {
    return NextResponse.json({ error: "Battle not found." }, { status: 404 });
  }

  const [songA, songB] = await Promise.all([
    getSongCounts(matchId, match.songAId),
    getSongCounts(matchId, match.songBId),
  ]);

  return NextResponse.json({
    songAId: match.songAId,
    songBId: match.songBId,
    counts: {
      [match.songAId]: songA,
      [match.songBId]: songB,
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: matchId } = await params;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";

  try {
    await moderateLimiter.consume(`versus-react:user:${session.user.id}:${matchId}`);
    await moderateLimiter.consume(`versus-react:ip:${ip}:${matchId}`);
  } catch {
    return NextResponse.json(
      { error: "Slow down on reactions. Try again shortly." },
      { status: 429, headers: { "Retry-After": "10" } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reaction payload." }, { status: 400 });
  }

  const match = await prisma.versusMatch.findUnique({
    where: { id: matchId },
    select: { id: true, status: true, songAId: true, songBId: true },
  });
  if (!match) {
    return NextResponse.json({ error: "Battle not found." }, { status: 404 });
  }

  if (match.status !== "ACTIVE") {
    return NextResponse.json({ error: "Battle has ended." }, { status: 409 });
  }

  if (parsed.data.songId !== match.songAId && parsed.data.songId !== match.songBId) {
    return NextResponse.json({ error: "Song is not part of this battle." }, { status: 400 });
  }

  const userVote = await prisma.versusVote.findUnique({
    where: {
      matchId_userId: {
        matchId,
        userId: session.user.id,
      },
    },
    select: { votedSongId: true },
  });

  if (!userVote || userVote.votedSongId !== parsed.data.songId) {
    return NextResponse.json({ error: "React after voting for that track." }, { status: 403 });
  }

  await enqueueAnalytics({
    event: "versus_vote_reaction",
    userId: session.user.id,
    songId: parsed.data.songId,
    metadata: { matchId, emoji: parsed.data.emoji },
    timestamp: new Date().toISOString(),
  });

  let counts = normalizeCounts({});
  const redis = getRedis();
  if (redis) {
    const key = reactionKey(matchId, parsed.data.songId);
    await redis.hincrby(key, parsed.data.emoji, 1);
    await redis.expire(key, REACTION_TTL_SECONDS);
    counts = normalizeCounts(await redis.hgetall(key));
  }

  const supabase = createServerSupabaseClient();
  if (supabase) {
    await supabase.channel(CHANNELS.versus(matchId)).send({
      type: "broadcast",
      event: "reaction_update",
      payload: {
        matchId,
        songId: parsed.data.songId,
        emoji: parsed.data.emoji,
        counts,
      },
    });
  }

  return NextResponse.json({ ok: true, songId: parsed.data.songId, counts });
}
