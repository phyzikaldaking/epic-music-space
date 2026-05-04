import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { raised?: boolean };
  const raised = body.raised !== false;

  const updated = await prisma.roomParticipant.update({
    where: { roomId_userId: { roomId: id, userId: session.user.id } },
    data: { handRaised: raised },
    select: { handRaised: true },
  });

  return NextResponse.json({ handRaised: updated.handRaised });
}
