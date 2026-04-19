import { RateLimiterMemory, RateLimiterRedis } from "rate-limiter-flexible";
import type { Context, Next } from "hono";
import Redis from "ioredis";

// ─────────────────────────────────────────────────────────
// Shared Redis connection (null when REDIS_URL not set)
// ─────────────────────────────────────────────────────────

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!_redis) {
    _redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    _redis.on("error", (err: Error) =>
      console.error("[api/redis] error:", err.message)
    );
  }
  return _redis;
}

// ─────────────────────────────────────────────────────────
// Limiter factory
// ─────────────────────────────────────────────────────────

function createLimiter(keyPrefix: string, points: number, duration: number) {
  const redis = getRedis();
  if (redis) {
    return new RateLimiterRedis({ storeClient: redis, keyPrefix, points, duration });
  }
  return new RateLimiterMemory({ keyPrefix, points, duration });
}

export const strictLimiter = createLimiter("api:rl:strict", 10, 60);
export const lenientLimiter = createLimiter("api:rl:lenient", 100, 60);

// ─────────────────────────────────────────────────────────
// Hono middleware helper
// ─────────────────────────────────────────────────────────

type Limiter = typeof strictLimiter;

export function rateLimit(limiter: Limiter) {
  return async (c: Context, next: Next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";
    try {
      await limiter.consume(ip);
    } catch {
      return c.json(
        { error: "Too many requests. Please slow down." },
        429
      );
    }
    return next();
  };
}
