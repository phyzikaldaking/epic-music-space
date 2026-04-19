import { NextRequest, NextResponse } from "next/server";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe-webhook] Invalid signature", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    await handleCheckoutCompleted(session);
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const { songId, userId } = session.metadata ?? {};
  if (!songId || !userId) {
    console.error("[stripe-webhook] Missing metadata", session.metadata);
    return;
  }

  // Idempotency check
  const existing = await prisma.transaction.findUnique({
    where: { stripeSessionId: session.id },
  });
  if (existing?.status === "SUCCEEDED") return;

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
        stripePaymentIntentId: session.payment_intent as string | undefined,
        licenseTokenId: licenseToken.id,
      },
    });
  });

  console.log(`[stripe-webhook] License granted: song=${songId} user=${userId}`);
}
