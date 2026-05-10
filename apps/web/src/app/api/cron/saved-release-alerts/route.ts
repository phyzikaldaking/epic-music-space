import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronRequest } from "@/lib/routeAuth";
import { fanoutSavedArtistDrop } from "@/lib/savedReleaseNotifications";

export const runtime = "nodejs";

const LOOKBACK_MS = 15 * 60 * 1000;

/**
 * Cron sweep for scheduled releases that just became public.
 *
 * Songs with scheduledAt inside the lookback window are faned out to
 * users who saved tracks from the same artist. Dedupe happens per
 * (user, songId) in fanoutSavedArtistDrop, so reruns are safe.
 */
export async function GET(req: NextRequest) {
  const access = requireCronRequest(req);
  if (!access.ok) return access.response;

  const now = new Date();
  const since = new Date(now.getTime() - LOOKBACK_MS);

  const songs = await prisma.song.findMany({
    where: {
      isActive: true,
      isDraft: false,
      scheduledAt: { gt: since, lte: now },
    },
    select: { id: true },
    take: 100,
    orderBy: { scheduledAt: "desc" },
  });

  if (songs.length === 0) {
    return NextResponse.json({ swept: 0, queued: 0 });
  }

  let queued = 0;
  await Promise.allSettled(
    songs.map(async (song) => {
      const result = await fanoutSavedArtistDrop(song.id);
      queued += result.queued;
    }),
  );

  return NextResponse.json({ swept: songs.length, queued });
}
