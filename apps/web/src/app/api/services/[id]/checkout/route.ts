import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";
import { rateLimit } from "@/lib/rateLimitInline";

export const runtime = "nodejs";

const schema = z.object({
  brief: z.string().max(2000).optional(),
  briefUrl: z.string().url().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await rateLimit("strict", `service:checkout:${session.user.id}`);
  if (blocked) return blocked;

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid brief" }, { status: 400 });
  }

  const listing = await prisma.serviceListing.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      priceUsd: true,
      status: true,
      providerId: true,
      coverUrl: true,
    },
  });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (listing.status !== "LIVE") {
    return NextResponse.json({ error: "Listing not available" }, { status: 410 });
  }
  if (listing.providerId === session.user.id) {
    return NextResponse.json({ error: "You can't buy your own listing" }, { status: 400 });
  }

  const baseUrl = getSiteUrl();
  const amountCents = Math.round(Number(listing.priceUsd) * 100);

  const order = await prisma.serviceOrder.create({
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
  });

  const checkout = await stripe.checkout.sessions.create({
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
  });

  await prisma.serviceOrder.update({
    where: { id: order.id },
    data: { stripeSessionId: checkout.id },
  });

  await prisma.transaction.create({
    data: {
      userId: session.user.id,
      amount: listing.priceUsd,
      type: "SERVICE_PURCHASE",
      status: "PENDING",
      stripeSessionId: checkout.id,
      metadata: { orderId: order.id, listingId: listing.id, providerId: listing.providerId, type: "service_purchase" },
    },
  });

  return NextResponse.json({ url: checkout.url, orderId: order.id });
}
