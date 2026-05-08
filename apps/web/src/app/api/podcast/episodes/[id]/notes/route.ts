import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const noteSchema = z.object({
  body: z.string().min(2).max(3000),
  atSeconds: z.number().int().min(0).max(24 * 3600).optional().default(0),
  parentId: z.string().cuid().optional().nullable(),
  category: z.enum(["GENERAL", "MIX", "MASTER", "SONGWRITING", "ARRANGEMENT", "PERFORMANCE"]).default("GENERAL"),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const episode = await prisma.podcastEpisode.findUnique({
    where: { id },
    select: {
      show: { select: { ownerId: true } },
      roomId: true,
    },
  });
  if (!episode) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (episode.show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!episode.roomId) return NextResponse.json({ notes: [] });

  const notes = await prisma.roomTimelineNote.findMany({
    where: { roomId: episode.roomId },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    include: {
      user: { select: { id: true, name: true, username: true, image: true } },
      replies: {
        include: { user: { select: { id: true, name: true, username: true, image: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({ notes });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const episode = await prisma.podcastEpisode.findUnique({
    where: { id },
    select: {
      roomId: true,
      title: true,
      showId: true,
      show: { select: { ownerId: true } },
    },
  });
  if (!episode) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (episode.show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = noteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  let roomId = episode.roomId;
  if (!roomId) {
    const room = await prisma.room.create({
      data: {
        hostId: session.user.id,
        title: `${episode.title} Session`,
        status: "LIVE",
        maxCapacity: 50,
        sessionMode: "A_AND_R",
        studioVibe: "MIDNIGHT",
        participants: {
          create: { userId: session.user.id, role: "HOST" },
        },
      },
      select: { id: true },
    });
    roomId = room.id;
    await prisma.podcastEpisode.update({ where: { id }, data: { roomId } });
  }

  const note = await prisma.roomTimelineNote.create({
    data: {
      roomId,
      userId: session.user.id,
      parentId: parsed.data.parentId || null,
      category: parsed.data.category,
      body: parsed.data.body.trim(),
      atSeconds: parsed.data.atSeconds,
    },
    include: { user: { select: { id: true, name: true, username: true, image: true } } },
  });

  return NextResponse.json({ note }, { status: 201 });
}
