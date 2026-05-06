import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";

export const runtime = "nodejs";

const setSchema = z.object({
  status: z.enum(["GOING", "INTERESTED"]),
});

/**
 * GET    /api/verzuz/[id]/rsvp — current RSVP state + counts.
 * POST   /api/verzuz/[id]/rsvp — set Going / Interested.
 * DELETE /api/verzuz/[id]/rsvp — undo (remove your RSVP).
 *
 * RSVPs drive the verzuz-pre-start cron — anyone marked GOING or
 * INTERESTED gets a push 5 minutes before the match goes LIVE so they
 * have a chance to drop in.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const { id } = await params;

  const [going, interested, mine] = await Promise.all([
    prisma.verzuzRSVP.count({ where: { matchId: id, status: "GOING" } }),
    prisma.verzuzRSVP.count({ where: { matchId: id, status: "INTERESTED" } }),
    session?.user?.id
      ? prisma.verzuzRSVP.findUnique({
          where: { matchId_userId: { matchId: id, userId: session.user.id } },
          select: { status: true },
        })
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    going,
    interested,
    mine: mine?.status ?? null,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to RSVP" }, { status: 401 });
  }

  const { id } = await params;
  const blocked = await rateLimit("moderate", `verzuz:rsvp:${session.user.id}:${id}`);
  if (blocked) return blocked;

  const parsed = setSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const match = await prisma.verzuzMatch.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status === "COMPLETED") {
    return NextResponse.json(
      { error: "Match has already ended." },
      { status: 410 },
    );
  }

  await prisma.verzuzRSVP.upsert({
    where: { matchId_userId: { matchId: id, userId: session.user.id } },
    create: { matchId: id, userId: session.user.id, status: parsed.data.status },
    update: { status: parsed.data.status },
  });

  return NextResponse.json({ ok: true, status: parsed.data.status });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to RSVP" }, { status: 401 });
  }

  const { id } = await params;
  await prisma.verzuzRSVP.deleteMany({
    where: { matchId: id, userId: session.user.id },
  });
  return NextResponse.json({ ok: true });
}
