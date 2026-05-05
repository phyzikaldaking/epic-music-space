import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { buildIdempotencyKey } from "@/lib/idempotency";
import { createLicenseCheckoutSession, LicenseCheckoutError } from "@/lib/payments/licenseCheckout";

const checkoutSchema = z.object({
  songId: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid checkout request" }, { status: 400 });
  }

  const idempotencyKey = buildIdempotencyKey(request, "api-stripe-checkout", [
    session.user.id,
    parsed.data.songId,
    1,
  ]);

  try {
    const checkout = await createLicenseCheckoutSession({
      analytics: { event: "checkout_created" },
      idempotencyKey,
      quantity: 1,
      requestSource: "api/stripe/checkout",
      songId: parsed.data.songId,
      userId: session.user.id,
      userEmail: session.user.email,
    });
    return NextResponse.json({ url: checkout.checkoutUrl });
  } catch (error) {
    if (error instanceof LicenseCheckoutError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
