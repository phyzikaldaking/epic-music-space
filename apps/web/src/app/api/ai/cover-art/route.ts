import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { openai } from "@/lib/ai";
import { strictLimiter } from "@/lib/rateLimit";
import { readJsonBodyLimited, withRouteTimeout } from "@/lib/apiHardening";
import { getRequestId, jsonWithRequestId, withRequestId } from "@/lib/requestTracing";

const schema = z.object({
  trackName: z.string().min(1).max(120),
  genre: z.string().max(60).optional(),
  count: z.number().int().min(1).max(3).optional().default(3),
});

export const runtime = "nodejs";

// Cover-art generation (#5). Calls OpenAI's image API to render up to
// three album-cover candidates for the given track name + genre. Costs
// ~$0.04 per image so we cap and rate-limit aggressively. Returns
// base64 PNGs the client can preview before optionally uploading one to
// Vercel Blob alongside the published audio.
export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  // Two-tier rate limit (#9): per-user (10/min via strictLimiter) AND a
  // shared global key so a swarm of distinct users still can't blow past
  // a sane cost ceiling. Each generate call burns ~$0.04 × 3 images, so
  // at strictLimiter's 10/min the per-user worst case is $1.20/min/user
  // and 100 simultaneous users would cost $120/min without the global
  // backstop. The shared key uses the same limiter (10 req/min on the
  // shared bucket → $1.20/min platform-wide ceiling on cover art).
  try {
    await strictLimiter.consume(`ai:cover:${session.user.id}`);
  } catch {
    return jsonWithRequestId(
      requestId,
      { error: "Slow down — try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  try {
    await strictLimiter.consume("ai:cover:global");
  } catch {
    return jsonWithRequestId(
      requestId,
      {
        error:
          "Cover art is busy across the platform right now. Try again shortly.",
      },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const client = openai;
  if (!client) {
    return jsonWithRequestId(
      requestId,
      { error: "Image generation is offline." },
      { status: 503 },
    );
  }

  const bodyResult = await readJsonBodyLimited<unknown>(req, {
    maxBytes: 8 * 1024,
    invalidMessage: "Expected JSON body",
  });
  if (!bodyResult.ok) return withRequestId(bodyResult.response, requestId);

  const parsed = schema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonWithRequestId(
      requestId,
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const { trackName, genre, count } = parsed.data;
  const prompt = [
    `Album cover for "${trackName}".`,
    genre ? `Genre: ${genre}.` : "",
    "Vibrant, modern, professional. Symbolic imagery, no text or letters.",
    "Square aspect ratio. Print-ready, high contrast.",
  ]
    .filter(Boolean)
    .join(" ");

  // Retry budget (#30): the OpenAI image endpoint occasionally 5xxs or
  // returns empty data arrays. A transparent retry with light backoff
  // recovers the request without burning a fresh $0.04 × N on every
  // user retry. Cap at 3 attempts so a permanently-broken upstream
  // doesn't quintuple latency. The shared timeout (#15) caps the total
  // wall clock so the user never waits more than ~45s.
  //
  // Each attempt passes an AbortSignal derived from the outer timeout
  // so the OpenAI fetch is actually cancelled when withRouteTimeout
  // fires — without this the underlying request keeps running and the
  // server holds a connection open even though we already returned 504.
  const result = await withRouteTimeout("ai-cover-art", 45_000, async (signal) => {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await client.images.generate(
          {
            model: "gpt-image-1",
            prompt,
            n: count,
            size: "1024x1024",
          },
          { signal },
        );
        const images = (response.data ?? [])
          .map((img) => img.b64_json)
          .filter((b64): b64 is string => Boolean(b64));
        if (images.length > 0) return images;
        // Empty array — treat as a retryable failure.
        lastErr = new Error("empty image set");
      } catch (err) {
        // Abort signals must propagate immediately; retrying would
        // dangle the timeout response.
        if (signal?.aborted) throw err;
        lastErr = err;
      }
      // Exponential backoff: 500ms, 1500ms.
      await new Promise((r) => setTimeout(r, 500 * (1 << attempt)));
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error("cover art generation failed");
  });
  if (!result.ok) {
    console.warn("[ai-cover-art] generation failed", { requestId });
    return withRequestId(result.response, requestId);
  }

  return jsonWithRequestId(requestId, {
    images: result.value.map((b64) => `data:image/png;base64,${b64}`),
  });
}
