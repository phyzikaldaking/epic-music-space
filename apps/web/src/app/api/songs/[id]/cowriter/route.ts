import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";

const interestSchema = z.object({
  shareBpsRequested: z.coerce.number().int().min(10).max(500), // 0.1% – 5%
  priceCents: z.coerce.number().int().min(1000).max(100_000), // $10 – $1,000
  message: z.string().max(500).optional(),
});

/**
 * POST /api/songs/[id]/cowriter
 *
 * Captures a fan's intent to become a co-writer on a published track.
 * MVP: writes a CoWriterInterest row (status: PENDING). The artist
 * sees the queue on their dashboard, accepts/declines; the actual
 * Stripe checkout for the share purchase runs in a separate flow.
 *
 * Idempotent on (songId, fanId) — repeated submissions update the
 * existing row rather than fanning out duplicates.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: songId } = await params;

  try {
    await strictLimiter.consume(`cowriter-interest:${session.user.id}`);
  } catch {
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }

  let body: z.infer<typeof interestSchema>;
  try {
    body = interestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Make sure the song exists and the fan isn't the artist.
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { id: true, artistId: true },
  });
  if (!song) {
    return NextResponse.json({ error: "song not found" }, { status: 404 });
  }
  if (song.artistId === session.user.id) {
    return NextResponse.json(
      { error: "You're already the artist on this track." },
      { status: 409 },
    );
  }

  const interest = await prisma.coWriterInterest.upsert({
    where: { songId_fanId: { songId, fanId: session.user.id } },
    create: {
      songId,
      fanId: session.user.id,
      shareBpsRequested: body.shareBpsRequested,
      priceCents: body.priceCents,
      message: body.message,
    },
    update: {
      shareBpsRequested: body.shareBpsRequested,
      priceCents: body.priceCents,
      message: body.message,
      // Allow a fan who was DECLINED to re-submit by reverting to PENDING.
      status: "PENDING",
    },
    select: { id: true, status: true, shareBpsRequested: true, priceCents: true },
  });

  return NextResponse.json(
    {
      ok: true,
      interest,
      message:
        "Request sent to the artist. They'll review and approve before any charge.",
    },
    { status: 201 },
  );
}

/**
 * GET /api/songs/[id]/cowriter
 *
 * Returns the viewer's existing interest (if any) plus a queue size
 * so the UI can show "X fans want to co-write this — be next".
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const { id: songId } = await params;

  const queueSize = await prisma.coWriterInterest.count({
    where: { songId, status: "PENDING" },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ queueSize, mine: null });
  }

  const mine = await prisma.coWriterInterest.findUnique({
    where: { songId_fanId: { songId, fanId: session.user.id } },
    select: {
      id: true,
      status: true,
      shareBpsRequested: true,
      priceCents: true,
      message: true,
    },
  });

  return NextResponse.json({ queueSize, mine });
}
