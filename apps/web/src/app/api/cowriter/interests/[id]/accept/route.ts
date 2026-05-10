import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await strictLimiter.consume(`cowriter-accept:${session.user.id}`);
  } catch {
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }

  const { id } = await params;

  const interest = await prisma.coWriterInterest.findUnique({
    where: { id },
    select: { id: true, status: true, song: { select: { id: true, artistId: true } } },
  });
  if (!interest) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (interest.song.artistId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.coWriterInterest.update({
    where: { id },
    data: { status: "ACCEPTED" },
    select: { id: true, status: true },
  });

  return NextResponse.json({ ok: true, interest: updated });
}

