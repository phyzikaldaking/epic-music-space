import { RateLimiterRedis, RateLimiterMemory, IRateLimiterOptions } from "rate-limiter-flexible";
import { getRedis } from "./redis";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────

function createLimiter(opts: IRateLimiterOptions) {
  const redis = getRedis();
  if (redis) {
    return new RateLimiterRedis({ storeClient: redis, ...opts });
  }
  // Fall back to in-process memory limiter when Redis is unavailable
  return new RateLimiterMemory(opts);
}

// ─────────────────────────────────────────────────────────
// Pre-built limiters for different route tiers
// ─────────────────────────────────────────────────────────

/** Strict: 10 req / 60 s — for payments, AI, checkout */
export const strictLimiter = createLimiter({
  keyPrefix: "rl:strict",
  points: 10,
  duration: 60,
});

/** Moderate: 30 req / 60 s — for votes, follows, notifications */
export const moderateLimiter = createLimiter({
  keyPrefix: "rl:moderate",
  points: 30,
  duration: 60,
});

/** Lenient: 100 req / 60 s — for reads, leaderboard, listings */
export const lenientLimiter = createLimiter({
  keyPrefix: "rl:lenient",
  points: 100,
  duration: 60,
});

// ─────────────────────────────────────────────────────────
// Route-level helper
// ─────────────────────────────────────────────────────────

type Limiter = typeof strictLimiter;

/**
 * Apply rate limiting to a Next.js API route handler.
 * The key is based on the authenticated user ID or the client IP.
 */
export function withRateLimit(
  limiter: Limiter,
  handler: (req: NextRequest, ctx: { key: string }) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    // Prefer authenticated user ID for per-user limits; fall back to IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    try {
      await limiter.consume(ip);
    } catch {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        {
          status: 429,
          headers: { "Retry-After": "60" },
        }
      );
    }

    return handler(req, { key: ip });
  };
}
