import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * US IRS 1099-K reporting threshold.
 * As of 2024, the threshold is $600 in gross payments.
 * (The $20k/200-transaction threshold was only applicable prior to 2024.)
 */
const US_1099K_THRESHOLD_CENTS = 60_000; // $600.00

/**
 * Countries that require VAT / GST handling.
 * Stripe Express collects this information during onboarding for EU/UK/AU/NZ accounts.
 * This list is used for informational UI hints only — actual VAT calculation
 * is handled by Stripe Tax (if enabled) or the connected account's local obligations.
 */
const VAT_REGIONS = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE", // EU member states
  "GB", // United Kingdom
  "AU", // Australia (GST)
  "NZ", // New Zealand (GST)
  "NO", // Norway
  "CH", // Switzerland
  "SG", // Singapore (GST)
]);

/**
 * GET /api/stripe-connect/tax
 *
 * Returns the tax compliance posture for the authenticated artist:
 * - Region / country
 * - Whether 1099-K reporting applies (US-only, based on YTD earnings)
 * - VAT / GST applicability
 * - Current year-to-date paid-out earnings
 * - Tax form collection status
 *
 * Response shape:
 * {
 *   country: string | null
 *   taxFormStatus: "NOT_COLLECTED" | "PENDING" | "COLLECTED" | "EXEMPT"
 *   isUsResident: boolean
 *   requiresVat: boolean
 *   ytdEarningsUsd: number           // sum of PAID payouts in current calendar year
 *   threshold1099Usd: number         // 600 for US accounts, 0 for non-US
 *   approaching1099: boolean         // ytd >= 80% of threshold
 *   exceeds1099: boolean             // ytd >= threshold (IRS reporting triggered)
 *   stripe1099Managed: boolean       // Stripe files 1099 on our behalf (Express accounts)
 *   taxNote: string                  // human-readable summary
 * }
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      role: true,
      connectCountry: true,
      taxFormStatus: true,
      connectPayoutsEnabled: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.role === "LISTENER") {
    return NextResponse.json({ error: "Not applicable for listeners." }, { status: 403 });
  }

  // Sum PAID payouts for the current calendar year
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const ytdResult = await prisma.payout.aggregate({
    where: {
      userId: user.id,
      status: "PAID",
      paidAt: { gte: yearStart },
    },
    _sum: { amount: true },
  });

  const ytdEarningsUsd = Number(ytdResult._sum.amount ?? 0);
  const ytdEarningsCents = Math.round(ytdEarningsUsd * 100);

  const country = user.connectCountry ?? null;
  const isUsResident = country === "US";
  const requiresVat = country !== null && VAT_REGIONS.has(country);

  // 1099-K logic (US only; Stripe files on our behalf for Express accounts)
  const threshold1099Usd = isUsResident ? US_1099K_THRESHOLD_CENTS / 100 : 0;
  const approaching1099 = isUsResident && ytdEarningsCents >= US_1099K_THRESHOLD_CENTS * 0.8;
  const exceeds1099 = isUsResident && ytdEarningsCents >= US_1099K_THRESHOLD_CENTS;

  // Tax note
  let taxNote: string;
  if (!country) {
    taxNote =
      "Complete Stripe Connect onboarding so we can determine your tax obligations.";
  } else if (isUsResident && exceeds1099) {
    taxNote =
      "You have exceeded the IRS 1099-K reporting threshold ($600). Stripe will file a 1099-K on your behalf at year-end.";
  } else if (isUsResident && approaching1099) {
    taxNote = `You are approaching the $600 IRS 1099-K threshold. Current YTD: $${ytdEarningsUsd.toFixed(2)}.`;
  } else if (isUsResident) {
    taxNote =
      "US resident. Stripe files 1099-K once you exceed $600 in annual earnings. Keep your SSN / EIN current in your Stripe Express account.";
  } else if (requiresVat) {
    taxNote = `Your account is registered in a VAT/GST region (${country}). Stripe Express collects your tax ID during onboarding. Consult your local tax advisor for VAT obligations.`;
  } else {
    taxNote = `Account registered in ${country}. No additional EMS-level tax collection required. Local obligations may apply.`;
  }

  return NextResponse.json({
    country,
    taxFormStatus: user.taxFormStatus,
    isUsResident,
    requiresVat,
    ytdEarningsUsd,
    threshold1099Usd,
    approaching1099,
    exceeds1099,
    stripe1099Managed: true, // Express accounts: Stripe handles 1099 filing
    taxNote,
  });
}
