import { stripe } from "./stripe";
import type Stripe from "stripe";

/**
 * Create a Stripe Express connected account for an artist.
 * Returns the account object.
 */
export async function createConnectedAccount(email: string): Promise<Stripe.Account> {
  return stripe.accounts.create({
    type: "express",
    email,
    capabilities: {
      transfers: { requested: true },
      card_payments: { requested: true },
    },
    settings: {
      payouts: {
        schedule: { interval: "weekly", weekly_anchor: "monday" },
      },
    },
  });
}

/**
 * Generate an account onboarding link for an artist to complete KYC.
 */
export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string
): Promise<Stripe.AccountLink> {
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
}

/**
 * Retrieve a connected account's details.
 */
export async function getAccount(accountId: string): Promise<Stripe.Account> {
  return stripe.accounts.retrieve(accountId);
}

/**
 * Check if an account has completed onboarding.
 */
export async function isAccountOnboarded(accountId: string): Promise<boolean> {
  const account = await getAccount(accountId);
  return account.charges_enabled && account.payouts_enabled;
}
