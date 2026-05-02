import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bidSchema = z.object({
  songId: z.string().min(1),
  amountUsd: z.number().min(25).max(10000),
  placement: z.enum(["premium_screen", "billboard", "prime_takeover"]).default("premium_screen"),
});

const SLOT_MULTIPLIER = {
  premium_screen: 1,
  billboard: 2,
  prime_takeover: 4,
} as const;

export async function GET() {
  const songs = await prisma.song.findMany({
    where: { isActive: true, boostScore: { gt: 0 } },
    orderBy: [{ boostScore: "desc" }, { aiScore: "desc" }],
    take: 25,
    select: {
      id: true,
      title: true,
      artist: true,
      aiScore: true,
      boostScore: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    auction: "marketplace_wall",
    leaders: songs.map((song, index) => ({
      rank: index + 1,
      songId: song.id,
      title: song.title,
      artist: song.artist,
      aiScore: song.aiScore,
      bidPower: song.boostScore,
      rankScore: song.aiScore + song.boostScore,
      updatedAt: song.updatedAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bidSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid bid" }, { status: 400 });
  }

  const { songId, amountUsd, placement } = parsed.data;
  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song || !song.isActive) return NextResponse.json({ error: "Song not found" }, { status: 404 });
  if (song.artistId !== session.user.id) return NextResponse.json({ error: "You can only bid with your own song." }, { status: 403 });

  const bidPower = Math.round(amountUsd * SLOT_MULTIPLIER[placement]);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.transaction.create({
      data: {
        userId: session.user.id,
        songId,
        amount: amountUsd,
        type: "BOOST",
        status: "PENDING",
        metadata: {
          type: "PLACEMENT_BID",
          placement,
          bidPower,
          amountUsd,
        },
      },
    });

    return tx.song.update({
      where: { id: songId },
      data: { boostScore: { increment: bidPower } },
      select: { id: true, title: true, artist: true, aiScore: true, boostScore: true },
    });
  });

  return NextResponse.json({
    ok: true,
    bid: { songId, amountUsd, placement, bidPower },
    song: {
      ...updated,
      rankScore: updated.aiScore + updated.boostScore,
    },
  }, { status: 201 });
}
