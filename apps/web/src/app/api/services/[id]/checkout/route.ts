import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { createPayPalServiceOrderCheckout, isPayPalConfigured } from "@/lib/paypal";
import { getSiteUrl } from "@/lib/site";
import { rateLimit } from "@/lib/rateLimitInline";
import { readJsonBodyLimited, withRouteTimeout } from "@/lib/apiHardening";
import { buildIdempotencyKey } from "@/lib/idempotency";
import { checkoutMaintenanceResponse, isCheckoutMaintenanceModeEnabled } from "@/lib/payments/checkoutMaintenance";

export const runtime = "nodejs";

const schema = z.object({
  brief: z.string().max(2000).optional(),
  briefUrl: z.string().url().optional(),
  paymentMethod: z.enum(["stripe", "paypal"]).default("stripe"),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isCheckoutMaintenanceModeEnabled()) {
    return checkoutMaintenanceResponse();
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await rateLimit("strict", `service:checkout:${session.user.id}`);
  if (blocked) return blocked;

  const ipBlocked = await rateLimit("strict", `service:checkout:ip:${ip}`);
  if (ipBlocked) return ipBlocked;

  const { id } = await params;
  const bodyResult = await readJsonBodyLimited<Record<string, unknown>>(req, {
    maxBytes: 24 * 1024,
  });
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = schema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid brief" }, { status: 400 });
  }
  const idempotencyKey = buildIdempotencyKey(req, "service-checkout", [
    session.user.id,
    id,
    parsed.data.brief,
    parsed.data.briefUrl,
    parsed.data.paymentMethod,
  ]);

  const listingLookup = await withRouteTimeout("service-checkout-listing-lookup", 2500, async () =>
    prisma.serviceListing.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        priceUsd: true,
        status: true,
        providerId: true,
        coverUrl: true,
      },
    }),
  );
  if (!listingLookup.ok) return listingLookup.response;
  const listing = listingLookup.value;
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (listing.status !== "LIVE") {
    return NextResponse.json({ error: "Listing not available" }, { status: 410 });
  }
  if (listing.providerId === session.user.id) {
    return NextResponse.json({ error: "You can't buy your own listing" }, { status: 400 });
  }
  if (parsed.data.paymentMethod === "paypal" && !isPayPalConfigured()) {
    return NextResponse.json(
      { error: "PayPal checkout is not configured yet. Use Stripe for now." },
      { status: 503 },
    );
  }

  const baseUrl = getSiteUrl();
  const amountCents = Math.round(Number(listing.priceUsd) * 100);

  const orderCreate = await withRouteTimeout("service-checkout-order-create", 3000, async () =>
    prisma.serviceOrder.create({
      data: {
        listingId: listing.id,
        buyerId: session.user.id,
        providerId: listing.providerId,
        priceUsd: listing.priceUsd,
        briefText: parsed.data.brief ?? null,
        briefUrl: parsed.data.briefUrl ?? null,
        status: "PENDING",
      },
      select: { id: true },
    }),
  );
  if (!orderCreate.ok) return orderCreate.response;
  const order = orderCreate.value;

  if (parsed.data.paymentMethod === "paypal") {
    const paypalCreate = await withRouteTimeout("service-checkout-paypal-create", 4500, async () =>
      createPayPalServiceOrderCheckout({
        internalOrderId: order.id,
        listingId: listing.id,
        listingTitle: listing.title,
        amountUsd: Number(listing.priceUsd),
      }),
    );
    if (!paypalCreate.ok) return paypalCreate.response;
    const paypal = paypalCreate.value;

    const txCreate = await withRouteTimeout("service-checkout-paypal-tx-create", 2500, async () =>
      prisma.transaction.create({
        data: {
          userId: session.user.id,
          amount: listing.priceUsd,
          type: "SERVICE_PURCHASE",
          status: "PENDING",
          metadata: {
            orderId: order.id,
            listingId: listing.id,
            providerId: listing.providerId,
            type: "service_purchase",
            idempotencyKey,
            paymentProvider: "paypal",
            paypalOrderId: paypal.paypalOrderId,
          },
        },
      }),
    );
    if (!txCreate.ok) return txCreate.response;

    return NextResponse.json({
      url: paypal.approvalUrl,
      orderId: order.id,
      provider: "paypal",
    });
  }

  const checkoutCreate = await withRouteTimeout("service-checkout-stripe-create", 4500, async () =>
    stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: listing.title.slice(0, 250),
              ...(listing.coverUrl ? { images: [listing.coverUrl] } : {}),
            },
          },
        },
      ],
      success_url: `${baseUrl}/dashboard/orders/${order.id}?status=success`,
      cancel_url: `${baseUrl}/services/${listing.id}?cancelled=1`,
      metadata: {
        type: "service_purchase",
        orderId: order.id,
        listingId: listing.id,
        buyerId: session.user.id,
        providerId: listing.providerId,
      },
    }, { idempotencyKey }),
  );
  if (!checkoutCreate.ok) return checkoutCreate.response;
  const checkout = checkoutCreate.value;

  const orderUpdate = await withRouteTimeout("service-checkout-order-update", 2500, async () =>
    prisma.serviceOrder.update({
      where: { id: order.id },
      data: { stripeSessionId: checkout.id },
    }),
  );
  if (!orderUpdate.ok) return orderUpdate.response;

  const txCreate = await withRouteTimeout("service-checkout-stripe-tx-create", 2500, async () =>
    prisma.transaction.create({
      data: {
        userId: session.user.id,
        amount: listing.priceUsd,
        type: "SERVICE_PURCHASE",
        status: "PENDING",
        stripeSessionId: checkout.id,
        metadata: {
          orderId: order.id,
          listingId: listing.id,
          providerId: listing.providerId,
          type: "service_purchase",
          idempotencyKey,
          paymentProvider: "stripe",
        },
      },
    }),
  );
  if (!txCreate.ok) return txCreate.response;

  return NextResponse.json({ url: checkout.url, orderId: order.id, provider: "stripe" });
}
