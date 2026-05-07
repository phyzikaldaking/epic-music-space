import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkStemAccess } from "@/lib/stemAccess";
import { startSeparation } from "@/lib/stemSeparation";
import { strictLimiter } from "@/lib/rateLimit";

/**
 * POST /api/songs/[id]/stems/separate
 *
 * Kicks off a Demucs stem separation job. Idempotent — if a job is
 * already QUEUED or PROCESSING it returns the existing state instead
 * of starting a duplicate. If the previous job is FAILED or there
 * are no stems yet, it starts a new one.
 *
 * Body: none.
 * Returns: 202 Accepted with { status, providerId } on success.
 *
 * Why 202: Replicate jobs typically take 30-90s. We hand off to the
 * webhook-driven flow rather than blocking the request, so the UI
 * can poll /api/songs/[id]/stems for updates.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  // Light rate-limit so a stuck UI can't accidentally fan out hundreds
  // of paid GPU jobs.
  try {
    await strictLimiter.consume(`stems-separate:${session.user.id}`);
  } catch {
    return NextResponse.json(
      { error: "Too many separation requests — try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const access = await checkStemAccess(id, session.user.id, session.user.role ?? null);
  if (access.reason === "song_not_found") {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }
  if (!access.ok) {
    return NextResponse.json(
      { error: "Stem separation requires holding a license to this track." },
      { status: 403 },
    );
  }

  const song = await prisma.song.findUnique({
    where: { id },
    select: {
      audioUrl: true,
      stemSeparationStatus: true,
      stemSeparationProviderId: true,
    },
  });
  if (!song) return NextResponse.json({ error: "Song not found" }, { status: 404 });

  // Idempotency: if a job is in flight, return its state.
  if (
    song.stemSeparationStatus === "QUEUED" ||
    song.stemSeparationStatus === "PROCESSING"
  ) {
    return NextResponse.json(
      {
        status: song.stemSeparationStatus,
        providerId: song.stemSeparationProviderId,
        message: "Separation already in progress.",
      },
      { status: 202 },
    );
  }
  if (song.stemSeparationStatus === "READY") {
    return NextResponse.json(
      { status: "READY", message: "Stems already available." },
      { status: 200 },
    );
  }

  // Reserve the slot before calling Replicate so a concurrent click
  // can't double-bill us.
  await prisma.song.update({
    where: { id },
    data: {
      stemSeparationStatus: "QUEUED",
      stemSeparationStartedAt: new Date(),
      stemSeparationError: null,
    },
  });

  const webhookBase =
    process.env.STEM_WEBHOOK_BASE_URL ?? process.env.NEXTAUTH_URL ?? "";
  const webhookUrl = webhookBase
    ? `${webhookBase.replace(/\/$/, "")}/api/webhooks/replicate`
    : undefined;

  try {
    const job = await startSeparation(song.audioUrl, { webhookUrl });
    await prisma.song.update({
      where: { id },
      data: {
        stemSeparationStatus: job.status === "succeeded" ? "READY" : "PROCESSING",
        stemSeparationProviderId: job.providerId,
      },
    });
    return NextResponse.json(
      { status: "PROCESSING", providerId: job.providerId },
      { status: 202 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Separation failed to start.";
    await prisma.song.update({
      where: { id },
      data: { stemSeparationStatus: "FAILED", stemSeparationError: message },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
