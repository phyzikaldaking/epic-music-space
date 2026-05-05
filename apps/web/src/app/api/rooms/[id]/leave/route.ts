import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const room = await prisma.room.findUnique({
    where: { id },
    select: { hostId: true },
  });
  if (!room) return NextResponse.json({ ok: true });

  // Hosts keep the room alive until they explicitly end it.
  if (room.hostId === session.user.id) {
    return NextResponse.json({ ok: true });
  }

  await prisma.roomParticipant.updateMany({
    where: { roomId: id, userId: session.user.id, leftAt: null },
    data: { leftAt: new Date(), handRaised: false, role: "LISTENER" },
  });

  return NextResponse.json({ ok: true });
}
