import { RateLimiterRedis, RateLimiterMemory } from "rate-limiter-flexible";
import { getRedis } from "./redis";
import { NextResponse } from "next/server";
// ─────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────
function createLimiter(opts) {
    const redis = getRedis();
    if (redis) {
        return new RateLimiterRedis(Object.assign({ storeClient: redis }, opts));
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
/**
 * Apply rate limiting to a Next.js API route handler.
 * The key is based on the authenticated user ID or the client IP.
 */
export function withRateLimit(limiter, handler) {
    return async (req) => {
        var _a, _b, _c, _d;
        // Prefer authenticated user ID for per-user limits; fall back to IP
        const ip = (_d = (_c = (_b = (_a = req.headers.get("x-forwarded-for")) === null || _a === void 0 ? void 0 : _a.split(",")[0]) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : req.headers.get("x-real-ip")) !== null && _d !== void 0 ? _d : "unknown";
        try {
            await limiter.consume(ip);
        }
        catch (_e) {
            return NextResponse.json({ error: "Too many requests. Please slow down." }, {
                status: 429,
                headers: { "Retry-After": "60" },
            });
        }
        return handler(req, { key: ip });
    };
}
