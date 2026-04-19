import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { cacheDel, CACHE_KEYS } from "@/lib/redis";
import { enqueueAiScoring, enqueueAnalytics } from "@/lib/queues";
const createSongSchema = z.object({
    title: z.string().min(1).max(200),
    artist: z.string().min(1).max(200),
    genre: z.string().max(100).optional(),
    description: z.string().max(2000).optional(),
    audioUrl: z.string().url("audioUrl must be a valid URL"),
    coverUrl: z.string().url("coverUrl must be a valid URL").optional(),
    bpm: z.coerce.number().int().min(20).max(999).optional(),
    key: z.string().max(10).optional(),
    licensePrice: z.coerce
        .number()
        .min(0.5, "License price must be at least $0.50")
        .max(100000),
    revenueSharePct: z.coerce
        .number()
        .min(0.01, "Revenue share must be at least 0.01%")
        .max(100),
    totalLicenses: z.coerce.number().int().min(1).max(10000).default(100),
});
/**
 * POST /api/songs/create
 *
 * Creates a new song listing on the marketplace.
 * Requires an authenticated session with role ARTIST, LABEL, or ADMIN.
 *
 * Body (JSON):
 *   title, artist, genre?, description?, audioUrl, coverUrl?,
 *   bpm?, key?, licensePrice, revenueSharePct, totalLicenses?
 *
 * Returns the created Song object (201).
 */
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
    let rawBody;
    try {
        rawBody = await req.json();
    }
    catch (_j) {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = createSongSchema.safeParse(rawBody);
    if (!parsed.success) {
        return NextResponse.json({ error: (_g = (_f = parsed.error.issues[0]) === null || _f === void 0 ? void 0 : _f.message) !== null && _g !== void 0 ? _g : "Invalid input" }, { status: 400 });
    }
    const song = await prisma.song.create({
        data: Object.assign(Object.assign({}, parsed.data), { artistId: session.user.id }),
    });
    // Invalidate trending cache so new song appears immediately
    await cacheDel(CACHE_KEYS.trendingSongs);
    // Background jobs: AI scoring + analytics
    await enqueueAiScoring(song.id);
    await enqueueAnalytics({
        event: "song_created",
        userId: session.user.id,
        songId: song.id,
        timestamp: new Date().toISOString(),
    });
    return NextResponse.json(Object.assign(Object.assign({}, song), { licensePrice: Number(song.licensePrice), revenueSharePct: Number(song.revenueSharePct) }), { status: 201 });
}
