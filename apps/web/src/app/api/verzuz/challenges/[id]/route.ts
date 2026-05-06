import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queues";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("accept"),
    opponentSongIds: z.array(z.string().cuid()).min(1).max(10),
  }),
  z.object({ action: z.literal("decline") }),
  z.object({ action: z.literal("cancel") }),
]);

/**
 * POST /api/verzuz/challenges/[id]
 *
 * - accept:  opponent picks their setlist; we create the VerzuzMatch + the
 *            10 zipped VerzuzRound rows atomically and link the resulting
 *            matchId back to the challenge.
 * - decline: opponent rejects.
 * - cancel:  challenger withdraws while still PENDING.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const challenge = await prisma.verzuzChallenge.findUnique({ where: { id } });
  if (!challenge) {
    return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
  }
  if (challenge.status !== "PENDING") {
    return NextResponse.json(
      { error: `Challenge is already ${challenge.status.toLowerCase()}.` },
      { status: 409 },
    );
  }
  if (challenge.expiresAt < new Date()) {
    await prisma.verzuzChallenge.update({
      where: { id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ error: "Challenge has expired." }, { status: 410 });
  }

  if (parsed.data.action === "cancel") {
    if (challenge.challengerId !== session.user.id) {
      return NextResponse.json(
        { error: "Only the challenger can cancel." },
        { status: 403 },
      );
    }
    await prisma.verzuzChallenge.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    return NextResponse.json({ ok: true, status: "CANCELLED" });
  }

  // accept / decline must be the opponent
  if (challenge.opponentId !== session.user.id) {
    return NextResponse.json({ error: "Only the opponent can respond." }, { status: 403 });
  }

  if (parsed.data.action === "decline") {
    await prisma.verzuzChallenge.update({
      where: { id },
      data: { status: "DECLINED", declinedAt: new Date() },
    });
    void enqueueNotification({
      userId: challenge.challengerId,
      type: "VERZUZ_CHALLENGE_DECLINED",
      title: "Your Verzuz invite was declined",
      body: "The opponent passed. Try a different artist or theme.",
      metadata: { challengeId: id },
    });
    return NextResponse.json({ ok: true, status: "DECLINED" });
  }

  // ── accept ─────────────────────────────────────────────────────────
  const { opponentSongIds } = parsed.data;
  if (opponentSongIds.length !== challenge.challengerSongIds.length) {
    return NextResponse.json(
      {
        error: `Pick exactly ${challenge.challengerSongIds.length} song${
          challenge.challengerSongIds.length === 1 ? "" : "s"
        } to match the challenger's setlist.`,
      },
      { status: 400 },
    );
  }

  // Validate every opponent song belongs to the caller and is active.
  const oppSongs = await prisma.song.findMany({
    where: {
      id: { in: opponentSongIds },
      artistId: session.user.id,
      isActive: true,
    },
    select: { id: true },
  });
  if (oppSongs.length !== opponentSongIds.length) {
    return NextResponse.json(
      { error: "One or more songs aren't yours or aren't active." },
      { status: 400 },
    );
  }

  // Resolve display names + counts for the new VerzuzMatch.
  const [challengerUser, opponentUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: challenge.challengerId },
      select: { id: true, name: true },
    }),
    prisma.user.findUnique({
      where: { id: challenge.opponentId },
      select: { id: true, name: true },
    }),
  ]);
  if (!challengerUser || !opponentUser) {
    return NextResponse.json(
      { error: "Challenger or opponent no longer exists." },
      { status: 410 },
    );
  }

  // Atomic create: VerzuzMatch + N VerzuzRound rows + flip the challenge
  // to ACCEPTED + link matchId. Either all succeed or none do.
  const startsAtFinal =
    challenge.proposedStartsAt.getTime() < Date.now()
      ? new Date()
      : challenge.proposedStartsAt;

  const created = await prisma.$transaction(async (tx) => {
    const match = await tx.verzuzMatch.create({
      data: {
        artistAId: challenge.challengerId,
        artistBId: challenge.opponentId,
        artistAName: challengerUser.name ?? "Artist A",
        artistBName: opponentUser.name ?? "Artist B",
        theme: challenge.proposedTheme,
        totalRounds: challenge.challengerSongIds.length,
        roundDurationSec: challenge.proposedRoundDurationSec,
        tier: challenge.proposedTier,
        startsAt: startsAtFinal,
        status: "SCHEDULED",
        rounds: {
          create: challenge.challengerSongIds.map((songAId, i) => ({
            roundNumber: i + 1,
            songAId,
            songBId: opponentSongIds[i],
          })),
        },
      },
    });

    await tx.verzuzChallenge.update({
      where: { id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        opponentSongIds,
        matchId: match.id,
      },
    });

    return match;
  });

  // Notify both sides that the match is staged.
  void Promise.allSettled([
    enqueueNotification({
      userId: challenge.challengerId,
      type: "VERZUZ_CHALLENGE_ACCEPTED",
      title: "🎤 Verzuz accepted",
      body: `${opponentUser.name ?? "The opponent"} accepted. Match starts ${startsAtFinal.toLocaleString()}.`,
      metadata: { challengeId: id, matchId: created.id },
    }),
    enqueueNotification({
      userId: challenge.opponentId,
      type: "VERZUZ_MATCH_STAGED",
      title: "🎤 Your Verzuz is on",
      body: `Setlist locked. ${created.totalRounds}-round match starts ${startsAtFinal.toLocaleString()}.`,
      metadata: { challengeId: id, matchId: created.id },
    }),
  ]);

  return NextResponse.json(
    { ok: true, status: "ACCEPTED", matchId: created.id },
    { status: 200 },
  );
}
