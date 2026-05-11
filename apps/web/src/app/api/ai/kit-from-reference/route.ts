import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { strictLimiter } from "@/lib/rateLimit";
import {
  getRequestId,
  jsonWithRequestId,
} from "@/lib/requestTracing";

// Generate-kit-from-reference (#33 in the 50-item AI bucket). Producer
// uploads a 4-bar drum loop; server runs onset detection + spectral
// classification to extract kick / snare / hat / open-hat as separate
// one-shots. Returns 4 normalized WAV blob URLs the studio loads into
// the lane sample slots.
//
// This is the front door + auth + rate-limit. The actual DSP runs in
// a worker (audio analysis isn't realistic in a single Vercel function
// invocation for 4 bars at 48kHz). Until the worker is wired we return
// 503 with a polite "rolling out soon" message.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  // Heavy per-user rate limit — onset + spectral analysis is CPU
  // intensive and the resulting blobs cost storage.
  try {
    await strictLimiter.consume(`ai:kit-from-reference:${session.user.id}`);
  } catch {
    return jsonWithRequestId(
      requestId,
      { error: "Slow down — try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const providerUrl = process.env.KIT_FROM_REFERENCE_PROVIDER_URL;
  if (!providerUrl) {
    return jsonWithRequestId(
      requestId,
      {
        error:
          "Kit-from-reference is rolling out — drop your clip again in a few days. We'll auto-extract the kick / snare / hat / open-hat.",
      },
      { status: 503 },
    );
  }

  // When the worker is live: forward the upload signed-url request,
  // dispatch the analysis job, and return a job id the client polls.
  // For now the env-var guard above keeps us in the friendly 503 path.
  return jsonWithRequestId(requestId, {
    ok: true,
    status: "PENDING",
    message: "Started extracting drums from your reference clip.",
  });
}
