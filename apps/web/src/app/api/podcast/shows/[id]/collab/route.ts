import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const addCollaboratorSchema = z.object({
  episodeId: z.string().cuid(),
  userId: z.string().cuid(),
  role: z.enum(["SPEAKER", "LISTENER"]).default("SPEAKER"),
});

const updateCollaboratorSchema = z.object({
  episodeId: z.string().cuid(),
  userId: z.string().cuid(),
  role: z.enum(["HOST", "SPEAKER", "LISTENER"]),
});

const removeCollaboratorSchema = z.object({
  episodeId: z.string().cuid(),
  userId: z.string().cuid(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const show = await prisma.podcastShow.findUnique({ where: { id }, select: { ownerId: true } });
  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const episodes = await prisma.podcastEpisode.findMany({
    where: { showId: id, roomId: { not: null } },
    select: {
      id: true,
      title: true,
      room: {
        select: {
          id: true,
          title: true,
          status: true,
          participants: {
            where: { leftAt: null },
            select: {
              userId: true,
              role: true,
              user: { select: { id: true, name: true, image: true, username: true } },
            },
          },
          timelineNotes: {
            where: { resolvedAt: null, parentId: null },
            select: { id: true },
            take: 100,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ episodes });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const show = await prisma.podcastShow.findUnique({ where: { id }, select: { ownerId: true } });
  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = addCollaboratorSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const episode = await prisma.podcastEpisode.findUnique({ where: { id: parsed.data.episodeId }, select: { showId: true, roomId: true, title: true } });
  if (!episode || episode.showId !== id) return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  if (!episode.roomId) return NextResponse.json({ error: "Create a session for this episode first." }, { status: 409 });

  await prisma.roomParticipant.upsert({
    where: { roomId_userId: { roomId: episode.roomId, userId: parsed.data.userId } },
    create: { roomId: episode.roomId, userId: parsed.data.userId, role: parsed.data.role },
    update: { role: parsed.data.role, leftAt: null },
  });

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const show = await prisma.podcastShow.findUnique({ where: { id }, select: { ownerId: true } });
  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = updateCollaboratorSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const episode = await prisma.podcastEpisode.findUnique({ where: { id: parsed.data.episodeId }, select: { showId: true, roomId: true } });
  if (!episode || episode.showId !== id) return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  if (!episode.roomId) return NextResponse.json({ error: "Create a session for this episode first." }, { status: 409 });

  await prisma.roomParticipant.update({
    where: { roomId_userId: { roomId: episode.roomId, userId: parsed.data.userId } },
    data: { role: parsed.data.role, leftAt: null },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const show = await prisma.podcastShow.findUnique({ where: { id }, select: { ownerId: true } });
  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const parsed = removeCollaboratorSchema.safeParse({
    episodeId: url.searchParams.get("episodeId"),
    userId: url.searchParams.get("userId"),
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const episode = await prisma.podcastEpisode.findUnique({ where: { id: parsed.data.episodeId }, select: { showId: true, roomId: true } });
  if (!episode || episode.showId !== id) return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  if (!episode.roomId) return NextResponse.json({ error: "Create a session for this episode first." }, { status: 409 });

  await prisma.roomParticipant.update({
    where: { roomId_userId: { roomId: episode.roomId, userId: parsed.data.userId } },
    data: { leftAt: new Date(), role: "LISTENER" },
  });

  return NextResponse.json({ ok: true });
}
