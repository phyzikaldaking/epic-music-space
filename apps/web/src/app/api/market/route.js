import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { strictLimiter, lenientLimiter } from "@/lib/rateLimit";
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from "@/lib/redis";
import { enqueueAnalytics } from "@/lib/queues";
// ─────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────
const buySchema = z.object({
    songId: z.string().min(1, "songId is required"),
    quantity: z.coerce.number().int().min(1).max(100).default(1),
});
// ─────────────────────────────────────────────────────────
// GET /api/market/listings
// Returns all active song listings that still have licenses available.
// ─────────────────────────────────────────────────────────
export async function GET(req) {
    var _a, _b, _c, _d;
    const ip = (_d = (_c = (_b = (_a = req.headers.get("x-forwarded-for")) === null || _a === void 0 ? void 0 : _a.split(",")[0]) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : req.headers.get("x-real-ip")) !== null && _d !== void 0 ? _d : "unknown";
    try {
        await lenientLimiter.consume(ip);
    }
    catch (_e) {
        return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    // Try Redis cache first
    const cacheKey = CACHE_KEYS.listings;
    const cached = await cacheGet(cacheKey);
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
    await cacheSet(cacheKey, result, CACHE_TTL.listings);
    return NextResponse.json(result);
}
// ─────────────────────────────────────────────────────────
// POST /api/market/buy
// Creates a Stripe Checkout session to purchase one or more licenses.
// ─────────────────────────────────────────────────────────
export async function POST(req) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const ip = (_d = (_c = (_b = (_a = req.headers.get("x-forwarded-for")) === null || _a === void 0 ? void 0 : _a.split(",")[0]) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : req.headers.get("x-real-ip")) !== null && _d !== void 0 ? _d : "unknown";
    try {
        await strictLimiter.consume(ip);
    }
    catch (_j) {
        return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const session = await auth();
    if (!((_e = session === null || session === void 0 ? void 0 : session.user) === null || _e === void 0 ? void 0 : _e.id)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = buySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: (_g = (_f = parsed.error.issues[0]) === null || _f === void 0 ? void 0 : _f.message) !== null && _g !== void 0 ? _g : "Invalid input" }, { status: 400 });
    }
    const { songId, quantity } = parsed.data;
    // Fetch song
    const song = await prisma.song.findUnique({ where: { id: songId } });
    if (!song || !song.isActive) {
        return NextResponse.json({ error: "Song not found" }, { status: 404 });
    }
    // Check availability
    const available = song.totalLicenses - song.soldLicenses;
    if (available <= 0) {
        return NextResponse.json({ error: "This song is sold out" }, { status: 409 });
    }
    if (quantity > available) {
        return NextResponse.json({ error: `Only ${available} license(s) available` }, { status: 409 });
    }
    // Duplicate ownership check
    if (quantity === 1) {
        const existing = await prisma.licenseToken.findFirst({
            where: { songId, holderId: session.user.id, status: "ACTIVE" },
        });
        if (existing) {
            return NextResponse.json({ error: "You already hold a license for this song" }, { status: 409 });
        }
    }
    const baseUrl = (_h = process.env.NEXT_PUBLIC_APP_URL) !== null && _h !== void 0 ? _h : "http://localhost:3000";
    // Create Stripe checkout session
    const stripeSession = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
            {
                price_data: {
                    currency: "usd",
                    unit_amount: Math.round(Number(song.licensePrice) * 100),
                    product_data: {
                        name: `License: ${song.title} by ${song.artist}`,
                        description: `Digital music license — ${String(song.revenueSharePct)}% revenue share per license`,
                        images: song.coverUrl ? [song.coverUrl] : [],
                    },
                },
                quantity,
            },
        ],
        metadata: { songId, userId: session.user.id, quantity: String(quantity) },
        success_url: `${baseUrl}/studio/${songId}?checkout=success`,
        cancel_url: `${baseUrl}/studio/${songId}?checkout=cancelled`,
    });
    // Record pending transaction
    await prisma.transaction.create({
        data: {
            userId: session.user.id,
            songId,
            amount: Number(song.licensePrice) * quantity,
            type: "LICENSE_PURCHASE",
            status: "PENDING",
            stripeSessionId: stripeSession.id,
            metadata: { quantity },
        },
    });
    // Track analytics
    await enqueueAnalytics({
        event: "market_buy_initiated",
        userId: session.user.id,
        songId,
        metadata: { quantity },
        timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ checkoutUrl: stripeSession.url }, { status: 201 });
}
