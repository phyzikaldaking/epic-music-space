import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;

let redis: Redis | null = null;

function hasUsableRedisUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const placeholderHosts = new Set(["host", "hostname", "example.com"]);

    if (!["redis:", "rediss:"].includes(url.protocol)) return false;
    if (placeholderHosts.has(url.hostname.toLowerCase())) return false;
    if (url.password.toLowerCase() === "password") return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Returns a shared ioredis client, or null when REDIS_URL is not configured.
 * All callers must handle the null case; Redis features degrade gracefully.
 */
export function getRedis(): Redis | null {
  if (!REDIS_URL || !hasUsableRedisUrl(REDIS_URL)) return null;

  if (!redis) {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      // Reconnect with exponential backoff, capped at 10 s
      reconnectOnError: (err) => {
        const targetErrors = ["READONLY", "ECONNREFUSED"];
        return targetErrors.some((e) => err.message.includes(e));
      },
    });

    redis.on("error", (err: Error) => {
      console.error("[redis] Connection error:", err.message);
    });

    redis.on("connect", () => {
      console.info("[redis] Connected");
    });
  }

  return redis;
}

// ---------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------

export const CACHE_TTL = {
  leaderboard: 60, // 1 minute
  trendingSongs: 30, // 30 seconds
  listings: 15, // 15 seconds
  studioProfile: 120, // 2 minutes
} as const;

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    console.error("[redis.cacheGet]", err);
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    console.error("[redis.cacheSet]", err);
  }
}

export async function cacheDel(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.del(key);
  } catch (err) {
    console.error("[redis.cacheDel]", err);
  }
}

export const CACHE_KEYS = {
  leaderboardSongs: "ems:leaderboard:songs",
  leaderboardArtists: "ems:leaderboard:artists",
  trendingSongs: "ems:trending:songs",
  listings: "ems:listings",
  studioProfile: (username: string) => `ems:studio:${username}`,
} as const;
