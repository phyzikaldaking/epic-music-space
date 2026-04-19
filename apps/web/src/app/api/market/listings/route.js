import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lenientLimiter } from "@/lib/rateLimit";
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from "@/lib/redis";
/**
 * GET /api/market/listings
 *
 * Returns all active song listings that still have licenses available.
 * Sorted by AI score (highest first). Results are Redis-cached for 15 s.
 */
export async function GET(req) {
    var _a, _b, _c, _d;
    const ip = (_d = (_c = (_b = (_a = req.headers.get("x-forwarded-for")) === null || _a === void 0 ? void 0 : _a.split(",")[0]) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : req.headers.get("x-real-ip")) !== null && _d !== void 0 ? _d : "unknown";
    try {
        await lenientLimiter.consume(ip);
    }
    catch (_e) {
        return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    // Serve from Redis cache when available
    const cached = await cacheGet(CACHE_KEYS.listings);
    if (cached)
        return NextResponse.json(cached);
    const allActive = await prisma.song.findMany({
        where: { isActive: true },
        orderBy: [{ aiScore: "desc" }, { createdAt: "desc" }],
        select: {
            id: true,
            title: true,
            artist: true,
            genre: true,
            coverUrl: true,
            licensePrice: true,
            revenueSharePct: true,
            totalLicenses: true,
            soldLicenses: true,
            aiScore: true,
            district: true,
            versusWins: true,
            createdAt: true,
        },
        take: 200,
    });
    const result = allActive
        .filter((s) => s.soldLicenses < s.totalLicenses)
        .slice(0, 100)
        .map((s) => (Object.assign(Object.assign({}, s), { availableLicenses: s.totalLicenses - s.soldLicenses, licensePrice: Number(s.licensePrice), revenueSharePct: Number(s.revenueSharePct) })));
    await cacheSet(CACHE_KEYS.listings, result, CACHE_TTL.listings);
    return NextResponse.json(result);
}
