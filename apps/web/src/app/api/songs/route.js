import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { enqueueAiScoring, enqueueAnalytics } from "@/lib/queues";
import { cacheGet, cacheSet, cacheDel, CACHE_KEYS, CACHE_TTL } from "@/lib/redis";
import { strictLimiter, lenientLimiter } from "@/lib/rateLimit";
const createSongSchema = z.object({
    title: z.string().min(1).max(200),
    artist: z.string().min(1).max(200),
    genre: z.string().max(100).optional(),
    description: z.string().max(2000).optional(),
    audioUrl: z.string().url(),
    coverUrl: z.string().url().optional(),
    bpm: z.coerce.number().int().min(20).max(999).optional(),
    key: z.string().max(10).optional(),
    licensePrice: z.coerce.number().min(0.5).max(100000),
    revenueSharePct: z.coerce.number().min(0.01).max(100),
    totalLicenses: z.coerce.number().int().min(1).max(10000).default(100),
});
export async function GET(req) {
    var _a, _b, _c, _d;
    const ip = (_d = (_c = (_b = (_a = req.headers.get("x-forwarded-for")) === null || _a === void 0 ? void 0 : _a.split(",")[0]) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : req.headers.get("x-real-ip")) !== null && _d !== void 0 ? _d : "unknown";
    try {
        await lenientLimiter.consume(ip);
    }
    catch (_e) {
        return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const cacheKey = CACHE_KEYS.trendingSongs;
    const cached = await cacheGet(cacheKey);
    if (cached)
        return NextResponse.json(cached);
    const songs = await prisma.song.findMany({
        where: { isActive: true },
        orderBy: [{ aiScore: "desc" }, { createdAt: "desc" }],
        take: 50,
    });
    await cacheSet(cacheKey, songs, CACHE_TTL.trendingSongs);
    return NextResponse.json(songs);
}
export async function POST(req) {
    var _a, _b, _c, _d, _e, _f, _g;
    const ip = (_d = (_c = (_b = (_a = req.headers.get("x-forwarded-for")) === null || _a === void 0 ? void 0 : _a.split(",")[0]) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : req.headers.get("x-real-ip")) !== null && _d !== void 0 ? _d : "unknown";
    try {
        await strictLimiter.consume(ip);
    }
    catch (_h) {
        return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const session = await auth();
    if (!((_e = session === null || session === void 0 ? void 0 : session.user) === null || _e === void 0 ? void 0 : _e.id)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user || user.role === "LISTENER") {
        return NextResponse.json({ error: "Only artists can upload songs." }, { status: 403 });
    }
    const body = await req.json();
    const parsed = createSongSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: (_g = (_f = parsed.error.issues[0]) === null || _f === void 0 ? void 0 : _f.message) !== null && _g !== void 0 ? _g : "Invalid input" }, { status: 400 });
    }
    const song = await prisma.song.create({
        data: Object.assign(Object.assign({}, parsed.data), { artistId: session.user.id }),
    });
    // Invalidate trending cache
    await cacheDel(CACHE_KEYS.trendingSongs);
    // Enqueue background AI scoring job
    await enqueueAiScoring(song.id);
    // Enqueue analytics
    await enqueueAnalytics({
        event: "song_uploaded",
        userId: session.user.id,
        songId: song.id,
        timestamp: new Date().toISOString(),
    });
    return NextResponse.json(song, { status: 201 });
}
