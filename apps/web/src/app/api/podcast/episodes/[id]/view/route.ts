import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const episode = await prisma.podcastEpisode.findUnique({ where: { id }, select: { showId: true } });
  if (!episode) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.podcastEpisode.update({
      where: { id },
      data: { viewCount: { increment: 1 }, playCount: { increment: 1 } },
    }),
    prisma.podcastShow.update({
      where: { id: episode.showId },
      data: { totalViews: { increment: 1 } },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
