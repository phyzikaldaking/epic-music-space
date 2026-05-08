import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";
import { PODCAST_EPISODE_STATUSES, slugifyPodcast } from "@/lib/podcast";

export const runtime = "nodejs";

const episodeSchema = z.object({
  title: z.string().min(3).max(160),
  synopsis: z.string().min(20).max(10000),
  seasonNumber: z.number().int().min(1).max(100).default(1),
  episodeNumber: z.number().int().min(1).max(10000).default(1),
  status: z.enum(PODCAST_EPISODE_STATUSES).default("DRAFT"),
  scheduledFor: z.string().datetime().optional().nullable(),
  audioUrl: z.string().url().optional().nullable(),
  coverUrl: z.string().url().optional().nullable(),
  muxUploadId: z.string().optional().nullable(),
  transcript: z.string().max(100000).optional().nullable(),
  captionsUrl: z.string().url().optional().nullable(),
  durationSec: z.number().int().min(0).max(24 * 3600).optional().nullable(),
  clipCount: z.number().int().min(0).max(500).default(0),
  roomId: z.string().cuid().optional().nullable(),
  slug: z.string().min(3).max(80).optional(),
});

async function resolveEpisodeSlug(showId: string, baseInput: string) {
  const base = slugifyPodcast(baseInput);
  let candidate = base;
  let suffix = 2;
  while (await prisma.podcastEpisode.findFirst({ where: { showId, slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const show = await prisma.podcastShow.findUnique({ where: { id }, select: { ownerId: true, isPublished: true } });
  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const episodes = await prisma.podcastEpisode.findMany({
    where: show.ownerId === session?.user?.id ? { showId: id } : { showId: id, status: "PUBLISHED" },
    orderBy: [{ seasonNumber: "desc" }, { episodeNumber: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ episodes });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const blocked = await rateLimit("strict", `podcast:episodes:create:${session.user.id}`);
  if (blocked) return blocked;

  const show = await prisma.podcastShow.findUnique({ where: { id }, select: { ownerId: true } });
  if (!show) return NextResponse.json({ error: "Show not found" }, { status: 404 });
  if (show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = episodeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const slug = await resolveEpisodeSlug(id, parsed.data.slug || parsed.data.title);
  const shouldPublish = parsed.data.status === "PUBLISHED";
  const shouldSchedule = parsed.data.status === "SCHEDULED";

  const created = await prisma.podcastEpisode.create({
    data: {
      showId: id,
      creatorId: session.user.id,
      title: parsed.data.title.trim(),
      slug,
      synopsis: parsed.data.synopsis.trim(),
      seasonNumber: parsed.data.seasonNumber,
      episodeNumber: parsed.data.episodeNumber,
      status: parsed.data.status,
      scheduledFor: shouldSchedule && parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null,
      publishedAt: shouldPublish ? new Date() : null,
      audioUrl: parsed.data.audioUrl || null,
      coverUrl: parsed.data.coverUrl || null,
      muxUploadId: parsed.data.muxUploadId || null,
      videoStatus: parsed.data.muxUploadId ? "UPLOADING" : "NONE",
      transcript: parsed.data.transcript?.trim() || null,
      captionsUrl: parsed.data.captionsUrl || null,
      durationSec: parsed.data.durationSec ?? null,
      clipCount: parsed.data.clipCount,
      roomId: parsed.data.roomId || null,
    },
    select: { id: true, slug: true },
  });

  return NextResponse.json(created, { status: 201 });
}
