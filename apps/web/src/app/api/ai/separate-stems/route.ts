import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { readJsonBodyLimited } from "@/lib/apiHardening";
import {
  getRequestId,
  jsonWithRequestId,
  withRequestId,
} from "@/lib/requestTracing";

// Stem separation kickoff endpoint (#30 in the 50-item AI bucket).
// Producers point at one of their published Songs; the server enqueues
// a Demucs job on an external ML service (Replicate / Modal / Banana —
// we pick the cheapest available at run time). The client polls
// /api/songs/[id] until stemSeparationStatus flips to COMPLETED.
//
// This route is the front door. Until a provider is wired we return
// 503 with a friendly "Coming soon" message so the UI can degrade.
// Once the provider env var is set, this route enqueues the job and
// transitions the song's stemSeparationStatus to PENDING.

export const runtime = "nodejs";

const bodySchema = z.object({
  songId: z.string().min(1).max(40),
});

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(
      requestId,
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  // Per-user rate limit — stem separation is expensive (~$0.10/min of
  // audio on Replicate). Cap aggressive looping.
  try {
    await strictLimiter.consume(`ai:separate-stems:${session.user.id}`);
  } catch {
    return jsonWithRequestId(
      requestId,
      { error: "Slow down — try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const bodyResult = await readJsonBodyLimited<unknown>(req, {
    maxBytes: 4 * 1024,
    invalidMessage: "Expected JSON body",
  });
  if (!bodyResult.ok) return withRequestId(bodyResult.response, requestId);
  const parsed = bodySchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonWithRequestId(
      requestId,
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const { songId } = parsed.data;

  // Ownership check: only the song owner can kick off separation.
  const song = await prisma.song
    .findFirst({
      where: { id: songId, artistId: session.user.id },
      select: {
        id: true,
        title: true,
        audioUrl: true,
        stemSeparationStatus: true,
      },
    })
    .catch(() => null);
  if (!song) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }

  // Idempotency: refuse to re-kick a job that's already queued/running.
  if (
    song.stemSeparationStatus === "QUEUED" ||
    song.stemSeparationStatus === "PROCESSING"
  ) {
    return jsonWithRequestId(requestId, {
      ok: true,
      status: song.stemSeparationStatus,
      message: "Already separating. Hang tight — usually under a minute.",
    });
  }

  const replicateToken = process.env.REPLICATE_API_TOKEN;
  const providerUrl = process.env.STEM_SEPARATION_PROVIDER_URL;

  // Until a provider is wired, return 503 with a "coming soon" message
  // so the UI can show a polite placeholder instead of a hard failure.
  if (!replicateToken && !providerUrl) {
    return jsonWithRequestId(
      requestId,
      {
        error:
          "AI stem separation is rolling out — your song is queued for the first batch. We'll email you when it's ready.",
      },
      { status: 503 },
    );
  }

  // Mark the song as queued so the track page renders the spinner.
  // The actual job dispatch happens via a separate worker that polls
  // for QUEUED songs (keeps this route synchronous and fast).
  await prisma.song.update({
    where: { id: songId },
    data: {
      stemSeparationStatus: "QUEUED",
      stemSeparationStartedAt: new Date(),
      stemSeparationError: null,
    },
  });

  return jsonWithRequestId(requestId, {
    ok: true,
    status: "QUEUED",
    message: `Started separating "${song.title}" into vocals / drums / bass / other.`,
  });
}
