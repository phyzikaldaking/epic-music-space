import Redis from "ioredis";
const REDIS_URL = process.env.REDIS_URL;
let redis = null;
/**
 * Returns a shared ioredis client, or null when REDIS_URL is not configured.
 * All callers must handle the null case — Redis features degrade gracefully.
 */
export function getRedis() {
    if (!REDIS_URL)
        return null;
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
        redis.on("error", (err) => {
            console.error("[redis] Connection error:", err.message);
        });
        redis.on("connect", () => {
            console.info("[redis] Connected");
        });
    }
    return redis;
}
// ─────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────
export const CACHE_TTL = {
    leaderboard: 60, // 1 minute
    trendingSongs: 30, // 30 seconds
    listings: 15, // 15 seconds
    studioProfile: 120, // 2 minutes
};
export async function cacheGet(key) {
    const client = getRedis();
    if (!client)
        return null;
    try {
        const raw = await client.get(key);
        return raw ? JSON.parse(raw) : null;
    }
    catch (err) {
        console.error("[redis.cacheGet]", err);
        return null;
    }
}
export async function cacheSet(key, value, ttlSeconds) {
    const client = getRedis();
    if (!client)
        return;
    try {
        await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    }
    catch (err) {
        console.error("[redis.cacheSet]", err);
    }
}
export async function cacheDel(key) {
    const client = getRedis();
    if (!client)
        return;
    try {
        await client.del(key);
    }
    catch (err) {
        console.error("[redis.cacheDel]", err);
    }
}
export const CACHE_KEYS = {
    leaderboardSongs: "ems:leaderboard:songs",
    leaderboardArtists: "ems:leaderboard:artists",
    trendingSongs: "ems:trending:songs",
    listings: "ems:listings",
    studioProfile: (username) => `ems:studio:${username}`,
};
