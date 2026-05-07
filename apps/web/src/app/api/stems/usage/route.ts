import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";

const usageSchema = z.object({
  sourceSongId: z.string().min(1),
  kind: z.enum(["VOCALS", "DRUMS", "BASS", "OTHER", "FULL"]),
  // Optional — set after the producer publishes the derived track
  // via /studio/new. Until then the usage is a "draft" tied only to
  // the producer.
  derivedSongId: z.string().min(1).optional(),
});

/**
 * POST /api/stems/usage
 *
 * Records that a producer dragged a stem from the Loop Browser into
 * their DAW. Called by the StemBrowser drag-end handler. Idempotent:
 * dragging the same stem twice in one session creates two rows but
 * the royalty waterfall dedupes by (sourceSongId, kind, derivedSongId,
 * producerId) when paying out — multiple drops still equal one share.
 *
 * The actual royalty math runs in the existing payout pipeline; this
 * route just plants the seed.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await strictLimiter.consume(`stems-usage:${session.user.id}`);
  } catch {
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }

  let body: z.infer<typeof usageSchema>;
  try {
    body = usageSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Confirm the source song exists and has stems before recording
  // a usage — prevents poisoned IDs from showing up in the royalty
  // waterfall.
  const source = await prisma.song.findUnique({
    where: { id: body.sourceSongId },
    select: { id: true, artistId: true, stemSeparationStatus: true },
  });
  if (!source) {
    return NextResponse.json({ error: "source song not found" }, { status: 404 });
  }
  if (source.stemSeparationStatus !== "READY") {
    return NextResponse.json({ error: "source has no stems" }, { status: 409 });
  }
  if (source.artistId === session.user.id) {
    // Pulling your own stem doesn't create a royalty obligation.
    return NextResponse.json({ ok: true, selfUsage: true });
  }

  const usage = await prisma.stemUsage.create({
    data: {
      sourceSongId: body.sourceSongId,
      kind: body.kind,
      derivedSongId: body.derivedSongId,
      producerId: session.user.id,
    },
    select: { id: true, shareBps: true },
  });

  return NextResponse.json({ ok: true, id: usage.id, shareBps: usage.shareBps });
}
