import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const createSessionSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(1500).optional().nullable(),
  episodeId: z.string().cuid().optional().nullable(),
  mode: z.enum(["PLAYBACK", "CRITIQUE", "A_AND_R", "SILENT_NOTES"]).default("A_AND_R"),
  vibe: z.enum(["NEON", "SUNSET", "MIDNIGHT"]).default("MIDNIGHT"),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const show = await prisma.podcastShow.findUnique({ where: { id }, select: { ownerId: true } });
  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sessions = await prisma.podcastEpisode.findMany({
    where: { showId: id, roomId: { not: null } },
    select: {
      id: true,
      title: true,
      roomId: true,
      updatedAt: true,
      room: {
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          sessionMode: true,
          studioVibe: true,
          startedAt: true,
          endedAt: true,
          participants: { select: { userId: true, role: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ sessions });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const show = await prisma.podcastShow.findUnique({ where: { id }, select: { ownerId: true } });
  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSessionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  if (parsed.data.episodeId) {
    const episode = await prisma.podcastEpisode.findUnique({ where: { id: parsed.data.episodeId }, select: { showId: true } });
    if (!episode || episode.showId !== id) return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  const room = await prisma.room.create({
    data: {
      hostId: session.user.id,
      title: parsed.data.title,
      description: parsed.data.description || null,
      status: "LIVE",
      maxCapacity: 50,
      sessionMode: parsed.data.mode,
      studioVibe: parsed.data.vibe,
      participants: {
        create: { userId: session.user.id, role: "HOST" },
      },
    },
    select: { id: true, title: true, status: true, sessionMode: true, studioVibe: true, startedAt: true },
  });

  if (parsed.data.episodeId) {
    await prisma.podcastEpisode.update({ where: { id: parsed.data.episodeId }, data: { roomId: room.id } });
  }

  return NextResponse.json({ room }, { status: 201 });
}
