import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lenientLimiter } from "@/lib/rateLimit";
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from "@/lib/redis";
/**
 * GET /api/songs/list
 *
 * Returns active songs ordered by AI score descending (trending first).
 * Supports optional query params:
 *   ?genre=hip-hop   — filter by genre (case-insensitive)
 *   ?limit=20        — override default take (max 100)
 *
 * Results are Redis-cached for 30 s when no filter params are provided.
 */
export async function GET(req) {
    var _a, _b, _c, _d, _e;
    const ip = (_d = (_c = (_b = (_a = req.headers.get("x-forwarded-for")) === null || _a === void 0 ? void 0 : _a.split(",")[0]) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : req.headers.get("x-real-ip")) !== null && _d !== void 0 ? _d : "unknown";
    try {
        await lenientLimiter.consume(ip);
    }
    catch (_f) {
        return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const { searchParams } = new URL(req.url);
    const genre = searchParams.get("genre");
    const rawLimit = Number((_e = searchParams.get("limit")) !== null && _e !== void 0 ? _e : "50");
    const limit = Math.min(Math.max(1, rawLimit), 100);
    // Only cache unfiltered requests
    if (!genre) {
        const cached = await cacheGet(CACHE_KEYS.trendingSongs);
        if (cached)
            return NextResponse.json(cached.slice(0, limit));
    }
    const songs = await prisma.song.findMany({
        where: Object.assign({ isActive: true }, (genre ? { genre: { equals: genre, mode: "insensitive" } } : {})),
        orderBy: [{ aiScore: "desc" }, { createdAt: "desc" }],
        select: {
            id: true,
            title: true,
            artist: true,
            genre: true,
            coverUrl: true,
            audioUrl: true,
            licensePrice: true,
            revenueSharePct: true,
            totalLicenses: true,
            soldLicenses: true,
            aiScore: true,
            district: true,
            createdAt: true,
        },
        take: limit,
    });
    const result = songs.map((s) => (Object.assign(Object.assign({}, s), { availableLicenses: s.totalLicenses - s.soldLicenses, licensePrice: Number(s.licensePrice), revenueSharePct: Number(s.revenueSharePct) })));
    if (!genre) {
        await cacheSet(CACHE_KEYS.trendingSongs, result, CACHE_TTL.trendingSongs);
    }
    return NextResponse.json(result);
}
