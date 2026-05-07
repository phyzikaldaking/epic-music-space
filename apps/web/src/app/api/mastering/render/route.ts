import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { startMastering, pollMastering } from "@/lib/aiMastering";
import { strictLimiter } from "@/lib/rateLimit";
import { z } from "zod";

const renderSchema = z.object({
  audioUrl: z.string().url(),
  referenceUrl: z.string().url().optional(),
  targetLufs: z.number().min(-30).max(-6).optional(),
});

/**
 * POST /api/mastering/render
 *
 * Kicks off an AI mastering job (matchering on Replicate) for an
 * already-uploaded audio URL. Polls up to 90 seconds inline and
 * returns the mastered URL. If it takes longer the client receives
 * { status: "processing", providerId } and can call
 * /api/mastering/status?id=… until ready.
 *
 * Rate-limited per user. Cost ~$0.01-0.05 per 3-minute track.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await strictLimiter.consume(`mastering:${session.user.id}`);
  } catch {
    return NextResponse.json(
      { error: "Too many mastering requests — try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let body: z.infer<typeof renderSchema>;
  try {
    body = renderSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  let job: Awaited<ReturnType<typeof startMastering>>;
  try {
    job = await startMastering(body.audioUrl, {
      referenceUrl: body.referenceUrl,
      targetLufs: body.targetLufs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "mastering failed to start" },
      { status: 502 },
    );
  }

  // Inline poll up to ~90s. Vercel functions default to 300s so we have
  // headroom; the early-exit means most users get a synchronous experience.
  const start = Date.now();
  const maxMs = 90_000;
  let lastStatus: Awaited<ReturnType<typeof pollMastering>> | null = null;
  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      lastStatus = await pollMastering(job.providerId);
    } catch (err) {
      return NextResponse.json(
        {
          status: "processing",
          providerId: job.providerId,
          message:
            "Mastering is still running. Poll /api/mastering/status to check.",
          warning: err instanceof Error ? err.message : "poll failed",
        },
        { status: 202 },
      );
    }
    if (lastStatus.status === "succeeded" && lastStatus.output) {
      return NextResponse.json(
        { status: "READY", masteredUrl: lastStatus.output, providerId: job.providerId },
        { status: 200 },
      );
    }
    if (lastStatus.status === "failed" || lastStatus.status === "canceled") {
      return NextResponse.json(
        { status: "FAILED", error: lastStatus.error ?? lastStatus.status },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(
    { status: "PROCESSING", providerId: job.providerId },
    { status: 202 },
  );
}
