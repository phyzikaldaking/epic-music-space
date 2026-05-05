import { NextResponse } from "next/server";
import { Prisma } from "@ems/db";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mintRoomToken, isLiveKitConfigured, getLiveKitConfig } from "@/lib/livekit";
import { rateLimit } from "@/lib/rateLimitInline";
import { isRoomExpired } from "@/lib/roomTier";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isLiveKitConfigured()) {
    return NextResponse.json(
      { error: "Live audio is not configured." },
      { status: 503 },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Cap reconnect storms: 30 token mints / min / user / room.
  const blocked = await rateLimit("moderate", `room:token:${session.user.id}:${id}`);
  if (blocked) return blocked;
  const joinResult = await prisma
    .$transaction(
      async (tx) => {
        const room = await tx.room.findUnique({
          where: { id },
          select: {
            id: true,
            hostId: true,
            status: true,
            maxCapacity: true,
            startedAt: true,
            host: { select: { subscriptionTier: true } },
            _count: { select: { participants: { where: { leftAt: null } } } },
          },
        });
        if (!room) return { kind: "not-found" as const };
        if (room.status !== "LIVE") return { kind: "ended" as const };
        if (isRoomExpired(room.startedAt, room.host.subscriptionTier)) {
          await tx.room.update({
            where: { id },
            data: { status: "ENDED", endedAt: new Date() },
          });
          return { kind: "ended" as const };
        }

        const isHost = room.hostId === session.user.id;
        if (!isHost) {
          const banned = await tx.roomBan.findUnique({
            where: { roomId_userId: { roomId: id, userId: session.user.id } },
            select: { id: true },
          });
          if (banned) return { kind: "banned" as const };
        }

        const existing = await tx.roomParticipant.findUnique({
          where: { roomId_userId: { roomId: id, userId: session.user.id } },
          select: { role: true, leftAt: true },
        });
        const alreadyActive = existing && !existing.leftAt;

        if (!isHost && !alreadyActive && room._count.participants >= room.maxCapacity) {
          return { kind: "capacity" as const };
        }

        if (!existing) {
          await tx.roomParticipant.create({
            data: {
              roomId: id,
              userId: session.user.id,
              role: isHost ? "HOST" : "LISTENER",
            },
          });
        } else if (existing.leftAt) {
          await tx.roomParticipant.update({
            where: { roomId_userId: { roomId: id, userId: session.user.id } },
            data: { leftAt: null },
          });
        }

        return {
          kind: "joined" as const,
          isHost,
          role: existing?.role ?? (isHost ? "HOST" as const : "LISTENER" as const),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    .catch((err) => {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2034"
      ) {
        return { kind: "conflict" as const };
      }
      console.error("[rooms.token]", err);
      return { kind: "failed" as const };
    });

  if (joinResult.kind === "not-found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (joinResult.kind === "ended") return NextResponse.json({ error: "Room has ended" }, { status: 410 });
  if (joinResult.kind === "banned") return NextResponse.json({ error: "You are banned from this room" }, { status: 403 });
  if (joinResult.kind === "capacity") return NextResponse.json({ error: "Room is at capacity" }, { status: 403 });
  if (joinResult.kind === "conflict") return NextResponse.json({ error: "Room is busy. Please try joining again." }, { status: 409 });
  if (joinResult.kind === "failed") return NextResponse.json({ error: "Could not join room" }, { status: 500 });

  const { role, isHost } = joinResult;
  const canPublish = role === "HOST" || role === "SPEAKER";

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  });

  let token: string;
  try {
    token = await mintRoomToken({
      roomId: id,
      identity: session.user.id,
      name: user?.name ?? user?.email ?? "Listener",
      canPublish,
      metadata: { role },
    });
  } catch (err) {
    console.error("[rooms.token.mint]", err);
    return NextResponse.json({ error: "Could not mint room token" }, { status: 503 });
  }

  const config = getLiveKitConfig()!;

  return NextResponse.json({
    token,
    url: config.url,
    role,
    isHost,
  });
}
