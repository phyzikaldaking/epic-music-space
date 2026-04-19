import { stripe } from "./stripe";
import type Stripe from "stripe";

/** EMS platform fee: 15% */
export const PLATFORM_FEE_PERCENT = 0.15;

export interface CheckoutSessionParams {
  /** Amount in dollars (e.g. 29.99) */
  amount: number;
  /** Artist's Stripe Connect account ID */
  artistStripeAccountId: string;
  /** Product metadata */
  productId: string;
  productTitle: string;
  /** Buyer info */
  customerEmail?: string;
  /** Redirect URLs */
  successUrl: string;
  cancelUrl: string;
}

/**
 * Create a Stripe Checkout Session for a marketplace product.
 * EMS takes PLATFORM_FEE_PERCENT of the transaction.
 * Artist receives the remainder via Stripe Connect transfer.
 */
export async function createCheckoutSession(
  params: CheckoutSessionParams
): Promise<Stripe.Checkout.Session> {
  const amountCents = Math.round(params.amount * 100);
  const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_PERCENT);

  return stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: params.productTitle,
            metadata: { productId: params.productId },
          },
        },
        quantity: 1,
      },
    ],
    customer_email: params.customerEmail,
    payment_intent_data: {
      application_fee_amount: platformFeeCents,
      transfer_data: {
        destination: params.artistStripeAccountId,
      },
      metadata: {
        productId: params.productId,
        platformFeePercent: String(PLATFORM_FEE_PERCENT * 100),
      },
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
}

/**
 * Calculate the split for a given sale amount.
 */
export function calculateSplit(amountDollars: number): {
  artistAmount: number;
  platformFee: number;
  total: number;
} {
  const platformFee = Math.round(amountDollars * PLATFORM_FEE_PERCENT * 100) / 100;
  const artistAmount = Math.round((amountDollars - platformFee) * 100) / 100;
  return { artistAmount, platformFee, total: amountDollars };
}
