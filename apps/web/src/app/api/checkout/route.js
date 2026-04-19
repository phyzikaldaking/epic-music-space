import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { enqueueAnalytics } from "@/lib/queues";
const checkoutSchema = z.object({
    songId: z.string().cuid(),
});
export async function POST(req) {
    var _a, _b, _c, _d, _e, _f, _g;
    // Rate limit checkout — prevents card testing attacks
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
    const contentType = (_f = req.headers.get("content-type")) !== null && _f !== void 0 ? _f : "";
    let body;
    if (contentType.includes("application/json")) {
        body = await req.json();
    }
    else {
        const formData = await req.formData();
        body = Object.fromEntries(formData.entries());
    }
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid songId" }, { status: 400 });
    }
    const { songId } = parsed.data;
    const song = await prisma.song.findUnique({ where: { id: songId } });
    if (!song || !song.isActive) {
        return NextResponse.json({ error: "Song not found" }, { status: 404 });
    }
    if (song.soldLicenses >= song.totalLicenses) {
        return NextResponse.json({ error: "Sold out" }, { status: 409 });
    }
    // Check for existing license
    const existingLicense = await prisma.licenseToken.findFirst({
        where: { songId, holderId: session.user.id, status: "ACTIVE" },
    });
    if (existingLicense) {
        return NextResponse.json({ error: "You already hold a license for this song." }, { status: 409 });
    }
    const baseUrl = (_g = process.env.NEXT_PUBLIC_APP_URL) !== null && _g !== void 0 ? _g : "http://localhost:3000";
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
                        description: `Digital music license #${song.soldLicenses + 1} of ${song.totalLicenses} — ${String(song.revenueSharePct)}% revenue share per license`,
                        images: song.coverUrl ? [song.coverUrl] : [],
                    },
                },
                quantity: 1,
            },
        ],
        metadata: {
            songId,
            userId: session.user.id,
        },
        success_url: `${baseUrl}/studio/${songId}?checkout=success`,
        cancel_url: `${baseUrl}/studio/${songId}?checkout=cancelled`,
    });
    // Record pending transaction
    await prisma.transaction.create({
        data: {
            userId: session.user.id,
            songId,
            amount: song.licensePrice,
            type: "LICENSE_PURCHASE",
            status: "PENDING",
            stripeSessionId: stripeSession.id,
        },
    });
    // Enqueue analytics
    await enqueueAnalytics({
        event: "checkout_initiated",
        userId: session.user.id,
        songId,
        timestamp: new Date().toISOString(),
    });
    return NextResponse.redirect(stripeSession.url, { status: 303 });
}
