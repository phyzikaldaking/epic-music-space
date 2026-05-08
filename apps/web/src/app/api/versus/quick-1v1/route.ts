import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { enqueueNotification } from "@/lib/queues";
import { makeFallbackQuickSessionId, saveQuick1v1Session } from "@/lib/quick1v1";

const quickSchema = z.object({
  songIds: z.array(z.string().cuid()).length(2),
  durationHours: z.number().int().min(1).max(24).default(6),
});

function shuffle<T>(input: T[]) {
  const next = [...input];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!["ARTIST", "PRODUCER"].includes(session.user.role)) {
    return NextResponse.json(
      { error: "Quick 1v1 is currently only available to artists and producers." },
      { status: 403 },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await strictLimiter.consume(`quick-1v1:user:${session.user.id}`);
    await strictLimiter.consume(`quick-1v1:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Too many quick battle attempts. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const body = await req.json();
  const parsed = quickSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const { songIds, durationHours } = parsed.data;
  if (new Set(songIds).size !== songIds.length) {
    return NextResponse.json(
      { error: "Choose two different songs for the two rounds." },
      { status: 400 },
    );
  }

  const ownSongs = await prisma.song.findMany({
    where: {
      id: { in: songIds },
      artistId: session.user.id,
      isActive: true,
    },
    select: { id: true, title: true },
  });

  if (ownSongs.length !== 2) {
    return NextResponse.json(
      { error: "Both selected songs must belong to you and be active." },
      { status: 400 },
    );
  }

  const candidates = await prisma.song.findMany({
    where: {
      isActive: true,
      artistId: { not: session.user.id },
      artist_: { role: { in: ["ARTIST", "PRODUCER"] } },
    },
    select: {
      id: true,
      title: true,
      artistId: true,
      artist: true,
    },
    take: 200,
    orderBy: { createdAt: "desc" },
  });

  if (candidates.length < 2) {
    return NextResponse.json(
      { error: "Not enough active opponents on-site yet. Try again shortly." },
      { status: 409 },
    );
  }

  const shuffled = shuffle(candidates);
  const rounds: Array<{ mine: string; theirs: string; opponentArtistId: string }> = [];
  const usedSongIds = new Set<string>();
  const usedOpponents = new Set<string>();

  for (const mine of songIds) {
    const pick = shuffled.find(
      (c) => !usedSongIds.has(c.id) && !usedOpponents.has(c.artistId),
    ) ?? shuffled.find((c) => !usedSongIds.has(c.id));

    if (!pick) {
      return NextResponse.json(
        { error: "Could not find enough random opponents for both rounds." },
        { status: 409 },
      );
    }

    rounds.push({ mine, theirs: pick.id, opponentArtistId: pick.artistId });
    usedSongIds.add(pick.id);
    usedOpponents.add(pick.artistId);
  }

  const endsAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

  const created = await prisma.$transaction(
    rounds.map((round) =>
      prisma.versusMatch.create({
        data: {
          songAId: round.mine,
          songBId: round.theirs,
          endsAt,
        },
        include: {
          songA: { select: { id: true, title: true, artist: true, artistId: true } },
          songB: { select: { id: true, title: true, artist: true, artistId: true } },
        },
      }),
    ),
  );

  await Promise.allSettled(
    created.map((match, idx) =>
      enqueueNotification({
        userId: match.songB.artistId,
        type: "VERSUS_QUICK_MATCH",
        title: "You got pulled into a quick 1v1",
        body: `Round ${idx + 1}: ${match.songA.title} vs ${match.songB.title} is now live.`,
        metadata: {
          matchId: match.id,
          round: idx + 1,
          format: "quick_1v1_two_round",
        },
      }),
    ),
  );

  const roundMatchIds: [string, string] = [created[0].id, created[1].id];
  const generatedSessionId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : makeFallbackQuickSessionId(roundMatchIds);

  await saveQuick1v1Session({
    id: generatedSessionId,
    creatorId: session.user.id,
    createdAt: new Date().toISOString(),
    roundMatchIds,
  });

  const quickSessionHref = `/versus/quick/${generatedSessionId}`;

  return NextResponse.json(
    {
      format: "quick_1v1_two_round",
      quickSessionId: generatedSessionId,
      quickSessionHref,
      rounds: created.map((match, idx) => ({
        round: idx + 1,
        matchId: match.id,
        href: `/versus/${match.id}`,
        mine: match.songA,
        opponent: match.songB,
      })),
    },
    { status: 201 },
  );
}
