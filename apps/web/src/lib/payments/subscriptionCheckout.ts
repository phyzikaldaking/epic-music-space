import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";
import { getStripePriceIdForTier } from "@/lib/subscriptions";
import type { SubscriptionTier } from "@ems/db";
import { checkoutMaintenanceMessage, isCheckoutMaintenanceModeEnabled } from "@/lib/payments/checkoutMaintenance";

export class SubscriptionCheckoutError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "SubscriptionCheckoutError";
  }
}

type SubscriptionCheckoutInput = {
  cancelPath?: string;
  successPath?: string;
  tier: SubscriptionTier;
  userId: string;
};

export async function createSubscriptionCheckoutSession(
  input: SubscriptionCheckoutInput,
) {
  if (isCheckoutMaintenanceModeEnabled()) {
    throw new SubscriptionCheckoutError(checkoutMaintenanceMessage(), 503);
  }

  const priceId = getStripePriceIdForTier(input.tier);
  if (!priceId) {
    throw new SubscriptionCheckoutError("Subscription tier not configured.", 503);
  }

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) {
    throw new SubscriptionCheckoutError("User not found", 404);
  }

  let customerId = user.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { emsUserId: user.id },
    });

    customerId = customer.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const siteUrl = getSiteUrl();
  const successUrl = `${siteUrl}${input.successPath ?? `/pricing?subscribed=${input.tier.toLowerCase()}`}`;
  const cancelUrl = `${siteUrl}${input.cancelPath ?? "/pricing"}`;

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      emsType: "SUBSCRIPTION",
      userId: user.id,
      tier: input.tier.toLowerCase(),
    },
  });

  if (!checkout.url) {
    throw new Error("Stripe subscription checkout did not return a URL");
  }

  return {
    checkoutUrl: checkout.url,
    customerId,
    sessionId: checkout.id,
  };
}
