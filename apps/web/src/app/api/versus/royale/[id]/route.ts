import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SONG_SELECT = {
  id: true,
  title: true,
  artist: true,
  coverUrl: true,
  audioUrl: true,
  aiScore: true,
} as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const battle = await prisma.battleRoyale.findUnique({
    where: { id },
    include: {
      entries: {
        include: { song: { select: SONG_SELECT } },
        orderBy: { votes: "desc" },
      },
      _count: { select: { votes: true } },
    },
  });

  if (!battle) {
    return NextResponse.json({ error: "Battle not found" }, { status: 404 });
  }

  return NextResponse.json(battle);
}
