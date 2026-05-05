import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { createServerSupabaseClient, CHANNELS } from "@/lib/supabase";

const voteSchema = z.object({
  songId: z.string().cuid(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to vote" }, { status: 401 });
  }

  const { id: battleId } = await params;

  const body = await req.json() as unknown;
  const parsed = voteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid songId" }, { status: 400 });
  }

  const { songId } = parsed.data;

  const battle = await prisma.battleRoyale.findUnique({
    where: { id: battleId },
    include: { entries: { select: { id: true, songId: true } } },
  });

  if (!battle) return NextResponse.json({ error: "Battle not found" }, { status: 404 });
  if (battle.status !== "ACTIVE" || new Date() > battle.endsAt) {
    return NextResponse.json({ error: "Battle has ended" }, { status: 409 });
  }

  const validEntry = battle.entries.find((e) => e.songId === songId);
  if (!validEntry) {
    return NextResponse.json({ error: "Song is not in this battle" }, { status: 400 });
  }

  const existing = await prisma.battleRoyaleVote.findUnique({
    where: { battleId_userId: { battleId, userId: session.user.id } },
  });

  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.battleRoyaleEntry.updateMany({
        where: { battleId, songId: existing.songId },
        data: { votes: { decrement: 1 } },
      });
    }

    await tx.battleRoyaleVote.upsert({
      where: { battleId_userId: { battleId, userId: session.user.id } },
      create: { battleId, userId: session.user.id, songId },
      update: { songId },
    });

    await tx.battleRoyaleEntry.updateMany({
      where: { battleId, songId },
      data: { votes: { increment: 1 } },
    });
  });

  const entries = await prisma.battleRoyaleEntry.findMany({
    where: { battleId },
    select: { id: true, songId: true, votes: true, position: true },
    orderBy: { votes: "desc" },
  });

  const supabase = createServerSupabaseClient();
  if (supabase) {
    await supabase
      .channel(CHANNELS.royale(battleId))
      .send({
        type: "broadcast",
        event: "vote_update",
        payload: { battleId, entries, votedSongId: songId },
      })
      .catch(() => null);
  }

  return NextResponse.json({ votedSongId: songId, entries });
}
