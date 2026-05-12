import { unstable_cache } from "next/cache";
import { stripe } from "@/lib/stripe";

export type ConnectStatus = {
  connected: boolean;
  onboardingComplete: boolean;
};

const TTL_SECONDS = 300;

async function fetchConnectStatus(stripeAccountId: string): Promise<ConnectStatus> {
  try {
    const account = await stripe.accounts.retrieve(stripeAccountId);
    return {
      connected: true,
      onboardingComplete: Boolean(
        account.charges_enabled && account.payouts_enabled && account.details_submitted,
      ),
    };
  } catch {
    return { connected: true, onboardingComplete: false };
  }
}

export const getCachedConnectStatus = (stripeAccountId: string) =>
  unstable_cache(
    () => fetchConnectStatus(stripeAccountId),
    ["stripe-connect-status", stripeAccountId],
    { revalidate: TTL_SECONDS, tags: [`stripe-connect:${stripeAccountId}`] },
  )();
