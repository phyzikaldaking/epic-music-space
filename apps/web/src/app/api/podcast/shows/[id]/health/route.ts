import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const show = await prisma.podcastShow.findUnique({ where: { id }, select: { ownerId: true } });
  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const episodes = await prisma.podcastEpisode.findMany({
    where: { showId: id },
    select: { id: true, title: true, videoStatus: true, muxUploadId: true, muxAssetId: true, muxPlaybackId: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });

  const failed = episodes.filter((episode) => episode.videoStatus === "FAILED");
  const processing = episodes.filter((episode) => episode.videoStatus === "PROCESSING" || episode.videoStatus === "UPLOADING");
  const stalled = processing.filter((episode) => Date.now() - episode.updatedAt.getTime() > 1000 * 60 * 30);

  return NextResponse.json({
    summary: {
      totalChecked: episodes.length,
      failures: failed.length,
      processing: processing.length,
      stalled: stalled.length,
      healthy: episodes.length - failed.length,
    },
    failed,
    stalled,
  });
}
