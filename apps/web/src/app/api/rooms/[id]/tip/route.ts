import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";
import { moderateLimiter } from "@/lib/rateLimit";
import { readJsonBodyLimited, withRouteTimeout } from "@/lib/apiHardening";
import { buildIdempotencyKey } from "@/lib/idempotency";
import {
  checkoutMaintenanceResponse,
  isCheckoutMaintenanceModeEnabled,
} from "@/lib/payments/checkoutMaintenance";

export const runtime = "nodejs";

// "Throw money on stage." The audience picks a dollar amount + an
// optional stage seat to direct it to (null = split across the
// whole stage on payout). Creates a Stripe Checkout session and a
// PENDING RoomTip row; the stripe webhook flips it to PAID and
// emits a `tip.paid` broadcast on the room channel so the browser
// can animate a bill arcing from the tipper's audience seat to the
// stage.

const tipSchema = z.object({
  // Optional. Null = "to the stage" (split). When set, the recipient
  // must be currently on stage (HOST or SPEAKER).
  recipientId: z.string().min(1).max(64).optional(),
  amount: z.number().min(1).max(500),
  note: z.string().max(140).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isCheckoutMaintenanceModeEnabled()) {
    return checkoutMaintenanceResponse();
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await moderateLimiter.consume(`room-tip:ip:${ip}`);
    await moderateLimiter.consume(`room-tip:user:${session.user.id}`);
  } catch {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const { id } = await params;
  const bodyResult = await readJsonBodyLimited<Record<string, unknown>>(req, {
    maxBytes: 4 * 1024,
  });
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = tipSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { amount, note, recipientId } = parsed.data;

  // Confirm the tipper is in the room and the recipient (if named)
  // is currently on stage. Drive-by tips to people who left look weird.
  const room = await prisma.room.findUnique({
    where: { id },
    select: {
      status: true,
      hostId: true,
      title: true,
      participants: {
        where: { leftAt: null },
        select: { userId: true, role: true },
      },
    },
  });
  if (!room || room.status !== "LIVE") {
    return NextResponse.json({ error: "Room not live" }, { status: 410 });
  }
  const tipperIn = room.participants.some((p) => p.userId === session.user!.id);
  if (!tipperIn) {
    return NextResponse.json({ error: "Not in room" }, { status: 403 });
  }
  if (recipientId) {
    const onStage = room.participants.find(
      (p) => p.userId === recipientId && (p.role === "HOST" || p.role === "SPEAKER"),
    );
    if (!onStage) {
      return NextResponse.json(
        { error: "Recipient not on stage" },
        { status: 400 },
      );
    }
    if (recipientId === session.user.id) {
      return NextResponse.json({ error: "You cannot tip yourself" }, { status: 400 });
    }
  }

  const baseUrl = getSiteUrl();
  const amountCents = Math.round(amount * 100);

  // Pre-create the RoomTip row so we have an id to put in Stripe
  // metadata before the webhook arrives. PENDING until the webhook
  // flips it. If checkout creation fails below we DON'T delete the
  // row — it's harmless and surfaces in admin dashboards.
  const tip = await prisma.roomTip.create({
    data: {
      roomId: id,
      tipperId: session.user.id,
      recipientId: recipientId ?? null,
      amountUsd: amount,
      note: note ?? null,
    },
    select: { id: true },
  });

  const idempotencyKey = buildIdempotencyKey(req, "room-tip-checkout", [
    session.user.id,
    id,
    amount,
    recipientId ?? "stage",
    note ?? "",
    tip.id,
  ]);

  const stripeSessionResult = await withRouteTimeout(
    "room-tip-stripe-checkout",
    4500,
    async () =>
      stripe.checkout.sessions.create(
        {
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: amountCents,
                product_data: {
                  name: recipientId
                    ? `Tip on stage — ${room.title}`
                    : `Tip the stage — ${room.title}`,
                  description: note ? `"${note}"` : "Money for the stage 🎤",
                },
              },
              quantity: 1,
            },
          ],
          metadata: {
            type: "room_tip",
            tipId: tip.id,
            roomId: id,
            tipperId: session.user.id,
            recipientId: recipientId ?? "",
            amount: String(amount),
          },
          success_url: `${baseUrl}/rooms/${id}?tip=success`,
          cancel_url: `${baseUrl}/rooms/${id}`,
        },
        { idempotencyKey },
      ),
  );
  if (!stripeSessionResult.ok) return stripeSessionResult.response;
  const stripeSession = stripeSessionResult.value;
  if (!stripeSession.url) {
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }

  // Stash the session id for webhook reconciliation.
  await prisma.roomTip.update({
    where: { id: tip.id },
    data: { stripeSessionId: stripeSession.id },
  });

  return NextResponse.json(
    { checkoutUrl: stripeSession.url, tipId: tip.id },
    { status: 201 },
  );
}
