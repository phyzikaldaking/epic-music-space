import { NextResponse } from "next/server";
import { Prisma } from "@ems/db";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRoomLimitsForTier } from "@/lib/roomTier";
import { notifyFollowersOfNewRoom } from "@/lib/roomNotifications";
import { rateLimit } from "@/lib/rateLimitInline";

export const runtime = "nodejs";

export async function GET() {
  const rooms = await prisma.room.findMany({
    where: { status: "LIVE" },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: {
      host: { select: { id: true, name: true, image: true, username: true } },
      currentSong: { select: { id: true, title: true, artist: true, coverUrl: true } },
      _count: { select: { participants: { where: { leftAt: null } } } },
    },
  });
  return NextResponse.json({ rooms });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Strict cap: 10 room creations / minute / user — abuse prevention.
  const blocked = await rateLimit("strict", `room:create:${session.user.id}`);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    songId?: string;
    studioProjectId?: string;
  };

  const title = body.title?.trim();
  if (!title || title.length < 3 || title.length > 120) {
    return NextResponse.json({ error: "Title must be 3–120 chars" }, { status: 400 });
  }
  if (body.description && body.description.length > 500) {
    return NextResponse.json({ error: "Description too long (max 500)" }, { status: 400 });
  }
  // songId must be a cuid-ish opaque string if provided
  if (body.songId && (typeof body.songId !== "string" || body.songId.length > 64)) {
    return NextResponse.json({ error: "Invalid songId" }, { status: 400 });
  }
  if (
    body.studioProjectId &&
    (typeof body.studioProjectId !== "string" || body.studioProjectId.length > 64)
  ) {
    return NextResponse.json({ error: "Invalid studioProjectId" }, { status: 400 });
  }
  const description = body.description?.trim() || null;

  const host = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, subscriptionTier: true },
  });
  if (!host) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const limits = getRoomLimitsForTier(host.subscriptionTier);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.room.findFirst({
          where: { hostId: host.id, status: "LIVE" },
          select: { id: true },
        });
        if (existing) {
          return { kind: "existing" as const, id: existing.id };
        }

        if (body.songId) {
          const song = await tx.song.findFirst({
            where: { id: body.songId, artistId: host.id, isActive: true },
            select: { id: true },
          });
          if (!song) {
            return { kind: "invalid-song" as const };
          }
        }
        // Linking a studio project to the live room turns this into a
        // "studio session" — stage seats edit the Yjs doc; audience
        // watches the beat materialize. We refuse to link a project
        // that the caller doesn't own (no hijacking someone else's
        // session). One live room per project at a time (unique
        // index on Room.studioProjectId).
        if (body.studioProjectId) {
          const project = await tx.studioProject.findUnique({
            where: { id: body.studioProjectId },
            select: { userId: true, liveRoom: { select: { id: true } } },
          });
          if (!project || project.userId !== host.id) {
            return { kind: "invalid-project" as const };
          }
          if (project.liveRoom) {
            return { kind: "project-busy" as const };
          }
        }

        const room = await tx.room.create({
          data: {
            hostId: host.id,
            title,
            description,
            currentSongId: body.songId ?? null,
            studioProjectId: body.studioProjectId ?? null,
            maxCapacity: limits.maxCapacity,
            stageLimit: limits.stageLimit,
            participants: {
              create: {
                userId: host.id,
                role: "HOST",
              },
            },
          },
          select: { id: true },
        });

        return { kind: "created" as const, id: room.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (result.kind === "existing") {
      return NextResponse.json(
        { error: "You already have a live room.", roomId: result.id },
        { status: 409 },
      );
    }
    if (result.kind === "invalid-song") {
      return NextResponse.json(
        { error: "Featured track must be one of your active tracks." },
        { status: 403 },
      );
    }
    if (result.kind === "invalid-project") {
      return NextResponse.json(
        { error: "Linked project must be one of yours." },
        { status: 403 },
      );
    }
    if (result.kind === "project-busy") {
      return NextResponse.json(
        { error: "That project is already live in another room." },
        { status: 409 },
      );
    }

    // Fire-and-forget: notify followers that the host went live.
    // Studio sessions get a distinct notification kind so push
    // routing can show "🎛️ producing live" vs the generic listen
    // party copy.
    void notifyFollowersOfNewRoom({
      roomId: result.id,
      hostId: host.id,
      hostName: host.name ?? "An artist",
      title,
      kind: body.studioProjectId ? "studio_session" : "listen_party",
    });

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2034"
    ) {
      return NextResponse.json(
        { error: "Room creation conflicted with another request. Please try again." },
        { status: 409 },
      );
    }
    console.error("[rooms.create]", err);
    return NextResponse.json(
      { error: "Could not open the room. Please try again." },
      { status: 500 },
    );
  }
}
