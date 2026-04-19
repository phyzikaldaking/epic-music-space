import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from "@/lib/redis";
import { lenientLimiter } from "@/lib/rateLimit";
export async function GET(req) {
    var _a, _b, _c, _d, _e, _f;
    // Rate limit reads
    const ip = (_d = (_c = (_b = (_a = req.headers.get("x-forwarded-for")) === null || _a === void 0 ? void 0 : _a.split(",")[0]) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : req.headers.get("x-real-ip")) !== null && _d !== void 0 ? _d : "unknown";
    try {
        await lenientLimiter.consume(ip);
    }
    catch (_g) {
        return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const { searchParams } = new URL(req.url);
    const type = (_e = searchParams.get("type")) !== null && _e !== void 0 ? _e : "songs";
    const limit = Math.min(parseInt((_f = searchParams.get("limit")) !== null && _f !== void 0 ? _f : "20"), 50);
    if (type === "artists") {
        const cacheKey = CACHE_KEYS.leaderboardArtists;
        const cached = await cacheGet(cacheKey);
        if (cached)
            return NextResponse.json(cached);
        // Top artists by total licenses sold across all their songs
        const artists = await prisma.user.findMany({
            where: { role: { in: ["ARTIST", "LABEL"] } },
            select: {
                id: true,
                name: true,
                image: true,
                studio: { select: { username: true, district: true } },
                songs: {
                    where: { isActive: true },
                    select: { soldLicenses: true, aiScore: true },
                },
                _count: { select: { followers: true } },
            },
            take: limit * 3, // over-fetch then sort
        });
        const ranked = artists
            .map((a) => {
            var _a, _b;
            return ({
                id: a.id,
                name: a.name,
                image: a.image,
                username: (_a = a.studio) === null || _a === void 0 ? void 0 : _a.username,
                district: (_b = a.studio) === null || _b === void 0 ? void 0 : _b.district,
                totalLicensesSold: a.songs.reduce((s, x) => s + x.soldLicenses, 0),
                avgAiScore: a.songs.length > 0
                    ? a.songs.reduce((s, x) => s + x.aiScore, 0) / a.songs.length
                    : 0,
                followers: a._count.followers,
                songCount: a.songs.length,
            });
        })
            .sort((a, b) => b.totalLicensesSold - a.totalLicensesSold)
            .slice(0, limit);
        await cacheSet(cacheKey, ranked, CACHE_TTL.leaderboard);
        return NextResponse.json(ranked);
    }
    // Default: top songs by AI score
    const cacheKey = CACHE_KEYS.leaderboardSongs;
    const cached = await cacheGet(cacheKey);
    if (cached)
        return NextResponse.json(cached);
    const songs = await prisma.song.findMany({
        where: { isActive: true },
        orderBy: [{ aiScore: "desc" }, { soldLicenses: "desc" }],
        take: limit,
        select: {
            id: true,
            title: true,
            artist: true,
            genre: true,
            coverUrl: true,
            licensePrice: true,
            revenueSharePct: true,
            soldLicenses: true,
            totalLicenses: true,
            aiScore: true,
            district: true,
            versusWins: true,
        },
    });
    await cacheSet(cacheKey, songs, CACHE_TTL.leaderboard);
    return NextResponse.json(songs);
}
