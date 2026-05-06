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

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Apply rate limiting to a Next.js API route handler.
 *
 * Key precedence: explicit `keyFor(req)` override (typically a session user
 * id) → "user:<id>"; otherwise the client IP. Per-user keys avoid penalising
 * everyone behind a shared NAT and stop a single abuser from burning their
 * IP-share against legitimate co-tenants.
 */
export function withRateLimit(
  limiter: Limiter,
  handler: (req: NextRequest, ctx: { key: string }) => Promise<NextResponse>,
  options: { keyFor?: (req: NextRequest) => Promise<string | null> | string | null } = {},
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    let key: string | null = null;
    if (options.keyFor) {
      try {
        const userId = await options.keyFor(req);
        if (userId) key = `user:${userId}`;
      } catch {
        // Resolver failure shouldn't block the request — fall back to IP.
      }
    }
    if (!key) key = `ip:${getClientIp(req)}`;

    try {
      await limiter.consume(key);
    } catch {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        {
          status: 429,
          headers: { "Retry-After": "60" },
        },
      );
    }

    return handler(req, { key });
  };
}
