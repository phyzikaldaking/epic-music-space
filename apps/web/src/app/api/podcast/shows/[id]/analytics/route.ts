import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const show = await prisma.podcastShow.findUnique({
    where: { id },
    select: { ownerId: true, totalViews: true },
  });
  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const episodes = await prisma.podcastEpisode.findMany({
    where: { showId: id },
    select: {
      id: true,
      title: true,
      status: true,
      viewCount: true,
      playCount: true,
      clipCount: true,
      durationSec: true,
      publishedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const totals = episodes.reduce(
    (acc, episode) => {
      acc.views += episode.viewCount;
      acc.plays += episode.playCount;
      acc.clips += episode.clipCount;
      if (episode.durationSec) acc.durationSec += episode.durationSec;
      return acc;
    },
    { views: 0, plays: 0, clips: 0, durationSec: 0 },
  );

  const avgClipPerEpisode = episodes.length ? Number((totals.clips / episodes.length).toFixed(2)) : 0;
  const viewToPlay = totals.views > 0 ? Number((totals.plays / totals.views).toFixed(3)) : 0;

  const sortedByViews = [...episodes].sort((a, b) => b.viewCount - a.viewCount);
  const bestEpisode = sortedByViews[0] ?? null;

  return NextResponse.json({
    summary: {
      totalViews: show.totalViews,
      episodeCount: episodes.length,
      avgClipPerEpisode,
      viewToPlay,
      avgDurationSec: episodes.length ? Math.round(totals.durationSec / episodes.length) : 0,
    },
    topEpisodes: sortedByViews.slice(0, 5),
    recommendations: [
      viewToPlay < 0.35 ? "Improve opening 20 seconds to increase play-through." : "Play-through rate is healthy.",
      avgClipPerEpisode < 3 ? "Increase clip output for better distribution reach." : "Clip throughput is healthy.",
      bestEpisode ? `Replicate packaging from '${bestEpisode.title}'.` : "Publish first episode to unlock recommendations.",
    ],
  });
}
