import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queues";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), opponentSongId: z.string().cuid() }),
  z.object({ action: z.literal("decline") }),
  z.object({ action: z.literal("cancel") }),
]);

/**
 * POST /api/versus/challenges/[id] — accept / decline / cancel.
 *
 * - accept: opponent picks their own active song; we create the VersusMatch
 *   atomically and link it back to the challenge.
 * - decline: opponent rejects; status flipped to DECLINED.
 * - cancel: challenger withdraws while still PENDING.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const parsed = actionSchema.safeParse(await _req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const challenge = await prisma.versusChallenge.findUnique({ where: { id } });
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
    await prisma.versusChallenge.update({
      where: { id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ error: "Challenge has expired." }, { status: 410 });
  }

  if (parsed.data.action === "cancel") {
    if (challenge.challengerId !== session.user.id) {
      return NextResponse.json({ error: "Only the challenger can cancel." }, { status: 403 });
    }
    await prisma.versusChallenge.update({
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
    await prisma.versusChallenge.update({
      where: { id },
      data: { status: "DECLINED", declinedAt: new Date() },
    });
    void enqueueNotification({
      userId: challenge.challengerId,
      type: "VERSUS_CHALLENGE_DECLINED",
      title: "Your challenge was declined",
      body: "The opponent passed on this one. Try a different artist or track.",
      metadata: { challengeId: id },
    });
    return NextResponse.json({ ok: true, status: "DECLINED" });
  }

  // accept — validate the opponent's song
  const { opponentSongId } = parsed.data;
  const oppSong = await prisma.song.findUnique({
    where: { id: opponentSongId },
    select: { id: true, artistId: true, isActive: true, title: true },
  });
  if (!oppSong || oppSong.artistId !== session.user.id || !oppSong.isActive) {
    return NextResponse.json(
      { error: "That song doesn't belong to you or isn't active." },
      { status: 400 },
    );
  }
  if (opponentSongId === challenge.challengerSongId) {
    return NextResponse.json({ error: "Songs must be distinct." }, { status: 400 });
  }

  const endsAt = new Date(Date.now() + challenge.durationHours * 60 * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    const match = await tx.versusMatch.create({
      data: {
        songAId: challenge.challengerSongId,
        songBId: opponentSongId,
        endsAt,
      },
    });
    const updated = await tx.versusChallenge.update({
      where: { id },
      data: {
        status: "ACCEPTED",
        opponentSongId,
        acceptedAt: new Date(),
        matchId: match.id,
      },
    });
    return { match, challenge: updated };
  });

  // Notify both sides.
  void enqueueNotification({
    userId: challenge.challengerId,
    type: "VERSUS_CHALLENGE_ACCEPTED",
    title: "Your challenge was accepted — battle is live",
    body: `"${oppSong.title}" stepped up. Vote at /versus/${result.match.id}.`,
    metadata: { matchId: result.match.id, challengeId: id },
  });
  void enqueueNotification({
    userId: challenge.opponentId,
    type: "VERSUS_BATTLE_STARTED",
    title: "Your battle is live",
    body: `Vote at /versus/${result.match.id}.`,
    metadata: { matchId: result.match.id, challengeId: id },
  });

  return NextResponse.json({ ok: true, match: result.match }, { status: 201 });
}
