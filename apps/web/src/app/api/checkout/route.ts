import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { z } from "zod";

const checkoutSchema = z.object({
  songId: z.string().cuid(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let body: Record<string, unknown>;

  if (contentType.includes("application/json")) {
    body = await req.json();
  } else {
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
    return NextResponse.json(
      { error: "You already hold a license for this song." },
      { status: 409 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

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

  return NextResponse.redirect(stripeSession.url!, { status: 303 });
}
