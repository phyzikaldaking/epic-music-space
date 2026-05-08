import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function createHeadline(showTitle: string, episodeTitle: string) {
  return `${showTitle}: ${episodeTitle} is live now`;
}

function createHook(episodeTitle: string) {
  return `In this episode: ${episodeTitle}. Full story now on Epic Music Space.`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const show = await prisma.podcastShow.findUnique({
    where: { id },
    select: {
      ownerId: true,
      title: true,
      slug: true,
      episodes: {
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: 5,
        select: {
          id: true,
          title: true,
          slug: true,
          synopsis: true,
          clipCount: true,
          transcript: true,
          captionsUrl: true,
          publishedAt: true,
          status: true,
        },
      },
    },
  });

  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const packs = show.episodes.map((episode) => ({
    episodeId: episode.id,
    episodeTitle: episode.title,
    releaseState: episode.status,
    publishUrl: `/podcast/${show.slug}/${episode.slug}`,
    headline: createHeadline(show.title, episode.title),
    hook: createHook(episode.title),
    clipPlan: {
      target: Math.max(3, episode.clipCount),
      available: episode.clipCount,
      recommendation: episode.clipCount < 3 ? "Generate at least 3 short clips for distribution." : "Clip output is healthy.",
    },
    captionPlan: episode.captionsUrl ? "Captions ready" : "Generate captions before social push",
    transcriptPlan: episode.transcript ? "Transcript available" : "Draft transcript summary for SEO + socials",
    channelSequence: [
      "YouTube Shorts",
      "TikTok",
      "Instagram Reels",
      "X / Threads",
      "Email newsletter",
    ],
  }));

  return NextResponse.json({ packs });
}
