import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PODCAST_EPISODE_STATUSES, slugifyPodcast } from "@/lib/podcast";

export const runtime = "nodejs";

const patchSchema = z.object({
  title: z.string().min(3).max(160).optional(),
  synopsis: z.string().min(20).max(10000).optional(),
  seasonNumber: z.number().int().min(1).max(100).optional(),
  episodeNumber: z.number().int().min(1).max(10000).optional(),
  status: z.enum(PODCAST_EPISODE_STATUSES).optional(),
  scheduledFor: z.string().datetime().optional().nullable(),
  audioUrl: z.string().url().optional().nullable(),
  coverUrl: z.string().url().optional().nullable(),
  transcript: z.string().max(100000).optional().nullable(),
  captionsUrl: z.string().url().optional().nullable(),
  durationSec: z.number().int().min(0).max(24 * 3600).optional().nullable(),
  clipCount: z.number().int().min(0).max(500).optional(),
  roomId: z.string().cuid().optional().nullable(),
  slug: z.string().min(3).max(80).optional(),
  muxUploadId: z.string().optional().nullable(),
});

async function resolveEpisodeSlug(showId: string, episodeId: string, baseInput: string) {
  const base = slugifyPodcast(baseInput);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = await prisma.podcastEpisode.findFirst({ where: { showId, slug: candidate }, select: { id: true } });
    if (!existing || existing.id === episodeId) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const episode = await prisma.podcastEpisode.findUnique({
    where: { id },
    include: {
      show: { select: { id: true, slug: true, title: true, ownerId: true, isPublished: true } },
    },
  });
  if (!episode) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (episode.status !== "PUBLISHED" && episode.show.ownerId !== session?.user?.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ episode });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const episode = await prisma.podcastEpisode.findUnique({
    where: { id },
    select: { showId: true, show: { select: { ownerId: true } }, publishedAt: true },
  });
  if (!episode) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (episode.show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const nextSlug = parsed.data.slug || parsed.data.title;
  const slug = nextSlug ? await resolveEpisodeSlug(episode.showId, id, nextSlug) : undefined;
  const nextStatus = parsed.data.status;

  const updated = await prisma.podcastEpisode.update({
    where: { id },
    data: {
      ...(parsed.data.title ? { title: parsed.data.title.trim() } : {}),
      ...(slug ? { slug } : {}),
      ...(parsed.data.synopsis ? { synopsis: parsed.data.synopsis.trim() } : {}),
      ...(parsed.data.seasonNumber ? { seasonNumber: parsed.data.seasonNumber } : {}),
      ...(parsed.data.episodeNumber ? { episodeNumber: parsed.data.episodeNumber } : {}),
      ...(nextStatus ? { status: nextStatus } : {}),
      ...(parsed.data.scheduledFor !== undefined ? { scheduledFor: parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null } : {}),
      ...(parsed.data.audioUrl !== undefined ? { audioUrl: parsed.data.audioUrl || null } : {}),
      ...(parsed.data.coverUrl !== undefined ? { coverUrl: parsed.data.coverUrl || null } : {}),
      ...(parsed.data.transcript !== undefined ? { transcript: parsed.data.transcript?.trim() || null } : {}),
      ...(parsed.data.captionsUrl !== undefined ? { captionsUrl: parsed.data.captionsUrl || null } : {}),
      ...(parsed.data.durationSec !== undefined ? { durationSec: parsed.data.durationSec ?? null } : {}),
      ...(parsed.data.clipCount !== undefined ? { clipCount: parsed.data.clipCount } : {}),
      ...(parsed.data.roomId !== undefined ? { roomId: parsed.data.roomId || null } : {}),
      ...(parsed.data.muxUploadId !== undefined
        ? {
            muxUploadId: parsed.data.muxUploadId || null,
            videoStatus: parsed.data.muxUploadId ? "UPLOADING" : "NONE",
          }
        : {}),
      ...(nextStatus === "PUBLISHED" && !episode.publishedAt ? { publishedAt: new Date() } : {}),
    },
    select: { id: true, slug: true, status: true },
  });

  return NextResponse.json(updated);
}
