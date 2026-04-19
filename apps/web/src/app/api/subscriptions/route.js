var _a, _b, _c, _d;
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
// ─────────────────────────────────────────────────────────
// Subscription tier config
// Each STRIPE_PRICE_ID_* env var must point to a recurring
// price in your Stripe dashboard.
// ─────────────────────────────────────────────────────────
export const SUBSCRIPTION_TIERS = [
    {
        key: "starter",
        name: "Starter",
        description: "For listeners who want to participate in the EMS economy.",
        priceId: (_a = process.env.STRIPE_PRICE_ID_STARTER) !== null && _a !== void 0 ? _a : "",
        monthlyUsd: 9,
        features: [
            "Unlimited song streaming",
            "Up to 5 active licenses",
            "Versus voting",
            "Basic leaderboard access",
        ],
    },
    {
        key: "pro",
        name: "Pro",
        description: "For serious fans and emerging artists.",
        priceId: (_b = process.env.STRIPE_PRICE_ID_PRO) !== null && _b !== void 0 ? _b : "",
        monthlyUsd: 29,
        features: [
            "Everything in Starter",
            "Up to 25 active licenses",
            "Song upload (up to 10 songs)",
            "AI score insights",
            "Studio profile + district badge",
        ],
    },
    {
        key: "prime",
        name: "Prime",
        description: "For professional artists building their brand.",
        priceId: (_c = process.env.STRIPE_PRICE_ID_PRIME) !== null && _c !== void 0 ? _c : "",
        monthlyUsd: 79,
        features: [
            "Everything in Pro",
            "Unlimited licenses",
            "Unlimited song uploads",
            "Priority AI scoring",
            "Versus match creation",
            "Downtown Prime district access",
            "Analytics dashboard",
        ],
    },
    {
        key: "label",
        name: "Label",
        description: "Run your own music label and sign artists.",
        priceId: (_d = process.env.STRIPE_PRICE_ID_LABEL) !== null && _d !== void 0 ? _d : "",
        monthlyUsd: 199,
        features: [
            "Everything in Prime",
            "Create & manage a label",
            "Sign up to 20 artists",
            "Label Row district access",
            "City billboard ad slots",
            "Stripe Connect payout dashboard",
            "Priority support",
        ],
    },
];
const subscribeSchema = z.object({
    tier: z.enum(["starter", "pro", "prime", "label"]),
});
// POST /api/subscriptions — create Stripe Checkout session for a subscription
export async function POST(req) {
    var _a, _b, _c, _d, _e, _f;
    const ip = (_d = (_c = (_b = (_a = req.headers.get("x-forwarded-for")) === null || _a === void 0 ? void 0 : _a.split(",")[0]) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : req.headers.get("x-real-ip")) !== null && _d !== void 0 ? _d : "unknown";
    try {
        await strictLimiter.consume(ip);
    }
    catch (_g) {
        return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const session = await auth();
    if (!((_e = session === null || session === void 0 ? void 0 : session.user) === null || _e === void 0 ? void 0 : _e.id)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }
    const tier = SUBSCRIPTION_TIERS.find((t) => t.key === parsed.data.tier);
    if (!(tier === null || tier === void 0 ? void 0 : tier.priceId)) {
        return NextResponse.json({ error: "Subscription tier not configured. Set STRIPE_PRICE_ID_* env vars." }, { status: 503 });
    }
    const baseUrl = (_f = process.env.NEXT_PUBLIC_APP_URL) !== null && _f !== void 0 ? _f : "http://localhost:3000";
    const checkoutSession = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: tier.priceId, quantity: 1 }],
        metadata: { userId: session.user.id, tier: tier.key },
        success_url: `${baseUrl}/pricing?subscribed=${tier.key}`,
        cancel_url: `${baseUrl}/pricing`,
        allow_promotion_codes: true,
    });
    return NextResponse.json({ checkoutUrl: checkoutSession.url });
}
// GET /api/subscriptions — get Stripe billing portal URL for current user
export async function GET(req) {
    var _a, _b, _c, _d, _e, _f;
    const ip = (_d = (_c = (_b = (_a = req.headers.get("x-forwarded-for")) === null || _a === void 0 ? void 0 : _a.split(",")[0]) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : req.headers.get("x-real-ip")) !== null && _d !== void 0 ? _d : "unknown";
    try {
        await strictLimiter.consume(ip);
    }
    catch (_g) {
        return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const session = await auth();
    if (!((_e = session === null || session === void 0 ? void 0 : session.user) === null || _e === void 0 ? void 0 : _e.id)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Find Stripe customer ID from existing transactions
    const tx = await prisma.transaction.findFirst({
        where: { userId: session.user.id, stripePaymentIntentId: { not: null } },
        select: { metadata: true },
    });
    const customerId = (tx === null || tx === void 0 ? void 0 : tx.metadata) && typeof tx.metadata === "object" && "stripeCustomerId" in tx.metadata
        ? tx.metadata.stripeCustomerId
        : undefined;
    if (!customerId) {
        return NextResponse.json({ error: "No billing account found. Subscribe to a plan first." }, { status: 404 });
    }
    const baseUrl = (_f = process.env.NEXT_PUBLIC_APP_URL) !== null && _f !== void 0 ? _f : "http://localhost:3000";
    const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${baseUrl}/dashboard`,
    });
    return NextResponse.json({ portalUrl: portal.url });
}
