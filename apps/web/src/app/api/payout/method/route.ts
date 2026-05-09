import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    method: z.enum(["STRIPE", "PAYPAL"]),
    paypalEmail: z.string().email().max(254).optional(),
  })
  .refine(
    (b) => b.method !== "PAYPAL" || !!b.paypalEmail,
    { message: "PayPal payouts require a PayPal email." },
  );

/**
 * GET /api/payout/method
 * Return the caller's current payout preference + the email on file.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      payoutMethod: true,
      paypalPayoutEmail: true,
      stripeConnectId: true,
      connectChargesEnabled: true,
      connectPayoutsEnabled: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    method: user.payoutMethod,
    paypalEmail: user.paypalPayoutEmail,
    stripeReady: Boolean(
      user.stripeConnectId && user.connectChargesEnabled && user.connectPayoutsEnabled,
    ),
  });
}

/**
 * PUT /api/payout/method
 * Switch the caller's payout rail. PayPal requires the email up-front so
 * we can validate and stash it in one round-trip.
 */
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await moderateLimiter.consume(`payout-method:${session.user.id}:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const data: {
    payoutMethod: "STRIPE" | "PAYPAL";
    paypalPayoutEmail?: string | null;
  } = { payoutMethod: parsed.data.method };
  if (parsed.data.method === "PAYPAL") {
    data.paypalPayoutEmail = parsed.data.paypalEmail!.toLowerCase().trim();
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { payoutMethod: true, paypalPayoutEmail: true },
  });

  return NextResponse.json({
    method: updated.payoutMethod,
    paypalEmail: updated.paypalPayoutEmail,
  });
}
