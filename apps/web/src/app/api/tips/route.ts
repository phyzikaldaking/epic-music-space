import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";
import { moderateLimiter } from "@/lib/rateLimit";
import { z } from "zod";

export const runtime = "nodejs";

const tipSchema = z.object({
  artistId: z.string().min(1),
  amount: z.number().min(1).max(10_000),
  songId: z.string().optional(),
  message: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await moderateLimiter.consume(ip);
  } catch {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = tipSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { artistId, amount, songId, message } = parsed.data;

  if (artistId === session.user.id) {
    return NextResponse.json({ error: "You cannot tip yourself" }, { status: 403 });
  }

  const artist = await prisma.user.findUnique({
    where: { id: artistId },
    select: { id: true, name: true, username: true },
  });
  if (!artist) {
    return NextResponse.json({ error: "Artist not found" }, { status: 404 });
  }

  const baseUrl = getSiteUrl();
  const amountCents = Math.round(amount * 100);

  const stripeSession = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: `Tip for ${artist.name ?? artist.username ?? "artist"}`,
            description: message
              ? `"${message}"`
              : `Support ${artist.name ?? artist.username ?? "this artist"} on Epic Music Space`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: "tip",
      fromUserId: session.user.id,
      artistId,
      songId: songId ?? "",
      message: message ?? "",
      amount: String(amount),
    },
    success_url: `${baseUrl}/${artist.username ? `studio/${artist.username}` : "dashboard"}?tip=success`,
    cancel_url: `${baseUrl}/${artist.username ? `studio/${artist.username}` : "dashboard"}`,
  });

  await prisma.transaction.create({
    data: {
      userId: session.user.id,
      songId: songId || null,
      amount,
      type: "TIP",
      status: "PENDING",
      stripeSessionId: stripeSession.id,
      metadata: { artistId, message: message ?? null },
    },
  });

  if (!stripeSession.url) {
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
  return NextResponse.json({ checkoutUrl: stripeSession.url }, { status: 201 });
}
