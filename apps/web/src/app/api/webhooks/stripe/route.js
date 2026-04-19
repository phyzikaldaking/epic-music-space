import { NextResponse } from "next/server";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queues";
export const runtime = "nodejs";
export async function POST(req) {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
        return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
    }
    catch (err) {
        console.error("[stripe-webhook] Invalid signature", err);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    switch (event.type) {
        case "checkout.session.completed": {
            const session = event.data.object;
            if (session.mode === "payment") {
                await handleLicenseCheckoutCompleted(session);
            }
            else if (session.mode === "subscription") {
                await handleSubscriptionCheckoutCompleted(session);
            }
            break;
        }
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
            const sub = event.data.object;
            await handleSubscriptionChange(sub, event.type);
            break;
        }
        default:
            break;
    }
    return NextResponse.json({ received: true });
}
// ─────────────────────────────────────────────────────────
// License purchase
// ─────────────────────────────────────────────────────────
async function handleLicenseCheckoutCompleted(session) {
    var _a;
    const { songId, userId } = (_a = session.metadata) !== null && _a !== void 0 ? _a : {};
    if (!songId || !userId) {
        console.error("[stripe-webhook] Missing metadata", session.metadata);
        return;
    }
    // Idempotency check
    const existing = await prisma.transaction.findUnique({
        where: { stripeSessionId: session.id },
    });
    if ((existing === null || existing === void 0 ? void 0 : existing.status) === "SUCCEEDED")
        return;
    // Atomic: increment soldLicenses and create license token
    await prisma.$transaction(async (tx) => {
        const song = await tx.song.findUniqueOrThrow({ where: { id: songId } });
        if (song.soldLicenses >= song.totalLicenses) {
            throw new Error("Song is sold out");
        }
        const tokenNumber = song.soldLicenses + 1;
        const [licenseToken] = await Promise.all([
            tx.licenseToken.create({
                data: {
                    songId,
                    holderId: userId,
                    tokenNumber,
                    price: song.licensePrice,
                    status: "ACTIVE",
                },
            }),
            tx.song.update({
                where: { id: songId },
                data: { soldLicenses: { increment: 1 } },
            }),
        ]);
        await tx.transaction.update({
            where: { stripeSessionId: session.id },
            data: {
                status: "SUCCEEDED",
                stripePaymentIntentId: session.payment_intent,
                licenseTokenId: licenseToken.id,
            },
        });
        // Notify buyer
        await enqueueNotification({
            userId,
            type: "LICENSE_PURCHASED",
            title: "License acquired! 🎵",
            body: `You now hold license #${tokenNumber} for "${song.title}". You'll earn ${String(song.revenueSharePct)}% of every future sale.`,
            metadata: { songId, tokenNumber },
        });
        // Notify artist
        await enqueueNotification({
            userId: song.artistId,
            type: "LICENSE_SOLD",
            title: "License sold! 💰",
            body: `License #${tokenNumber} of "${song.title}" was purchased.`,
            metadata: { songId, tokenNumber, buyerId: userId },
        });
    });
    console.log(`[stripe-webhook] License granted: song=${songId} user=${userId}`);
}
// ─────────────────────────────────────────────────────────
// Subscription purchase
// ─────────────────────────────────────────────────────────
async function handleSubscriptionCheckoutCompleted(session) {
    var _a, _b;
    const { userId, tier } = (_a = session.metadata) !== null && _a !== void 0 ? _a : {};
    if (!userId || !tier) {
        console.error("[stripe-webhook] Missing subscription metadata", session.metadata);
        return;
    }
    // Persist customer ID on the transaction record for the billing portal
    await prisma.transaction.create({
        data: {
            userId,
            amount: 0,
            type: "REVENUE_PAYOUT", // reuse existing enum; extend later for SUBSCRIPTION
            status: "SUCCEEDED",
            stripeSessionId: session.id,
            stripePaymentIntentId: (_b = session.subscription) !== null && _b !== void 0 ? _b : undefined,
            metadata: {
                stripeCustomerId: session.customer,
                tier,
                subscriptionId: session.subscription,
            },
        },
    });
    await enqueueNotification({
        userId,
        type: "SUBSCRIPTION_ACTIVATED",
        title: `${tier.charAt(0).toUpperCase() + tier.slice(1)} plan activated! 🚀`,
        body: `Welcome to EMS ${tier.charAt(0).toUpperCase() + tier.slice(1)}. Your new features are live.`,
        metadata: { tier },
    });
    console.log(`[stripe-webhook] Subscription activated: user=${userId} tier=${tier}`);
}
// ─────────────────────────────────────────────────────────
// Subscription lifecycle
// ─────────────────────────────────────────────────────────
async function handleSubscriptionChange(sub, eventType) {
    const customerId = sub.customer;
    // Find user by stored customer ID
    const tx = await prisma.transaction.findFirst({
        where: {
            metadata: {
                path: ["stripeCustomerId"],
                equals: customerId,
            },
        },
        select: { userId: true },
    });
    if (!tx) {
        console.warn(`[stripe-webhook] No user found for customer ${customerId}`);
        return;
    }
    const isCancelled = eventType === "customer.subscription.deleted" ||
        sub.status === "canceled" ||
        sub.status === "unpaid";
    if (isCancelled) {
        await enqueueNotification({
            userId: tx.userId,
            type: "SUBSCRIPTION_CANCELLED",
            title: "Subscription cancelled",
            body: "Your EMS subscription has ended. You can re-subscribe at any time from the pricing page.",
        });
    }
    console.log(`[stripe-webhook] Subscription ${eventType}: customer=${customerId}`);
}
