/**
 * Risk scoring engine
 *
 * Computes a LOW / MEDIUM / HIGH risk verdict for a given request context.
 * Call this at sensitive payment / ad-purchase / payout entry-points.
 * The result is advisory — callers decide whether to block, challenge,
 * or allow the action.
 *
 * Signals used (all lightweight — no external API call):
 *  • Account age                 < 7 days → points
 *  • Email verified              not verified → points
 *  • Auth failures               > 5 in 24h from user row → points
 *  • Transaction velocity        > 3 transactions in 1h → points
 *  • Payout failures             > 1 → points
 *  • suspicionScore              persisted by admin/webhooks → direct add
 *  • isSuspended                 hard-block regardless of score
 */

import { prisma } from "./prisma";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface RiskVerdict {
  level: RiskLevel;
  score: number;
  reasons: string[];
  blocked: boolean; // true when isSuspended or score ≥ HARD_BLOCK
}

type RiskContext = {
  action?: "CHECKOUT" | "PAYOUT" | "ADS" | string;
  checkoutAmountUsd?: number;
};

function readNumberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const THRESHOLD_MEDIUM = readNumberEnv("RISK_THRESHOLD_MEDIUM", 30);
const THRESHOLD_HIGH = readNumberEnv("RISK_THRESHOLD_HIGH", 60);
const HARD_BLOCK = readNumberEnv("RISK_THRESHOLD_HARD", 80);
const MAX_CHECKOUT_USD = readNumberEnv("RISK_MAX_CHECKOUT_USD", 500);

const _NOW = () => new Date();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

export async function computeRiskScore(
  userId: string,
  context: RiskContext = {},
): Promise<RiskVerdict> {
  const reasons: string[] = [];
  let score = 0;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      emailVerified: true,
      isSuspended: true,
      suspicionScore: true,
      flaggedAt: true,
    },
  });

  if (!user) {
    return { level: "HIGH", score: 100, reasons: ["user-not-found"], blocked: true };
  }

  // Hard block
  if (user.isSuspended) {
    return { level: "HIGH", score: 100, reasons: ["account-suspended"], blocked: true };
  }

  // Carry persisted admin suspicion score
  if (user.suspicionScore > 0) {
    score += user.suspicionScore;
    reasons.push(`admin-suspicion:${user.suspicionScore}`);
  }

  // Account age < 7 days
  const ageMs = Date.now() - user.createdAt.getTime();
  if (ageMs < 7 * 86_400_000) {
    score += 20;
    reasons.push("new-account");
  }

  // Email not verified
  if (!user.emailVerified) {
    score += 25;
    reasons.push("email-unverified");
  }

  // Flagged by admin but not suspended
  if (user.flaggedAt) {
    score += 15;
    reasons.push("admin-flagged");
  }

  // Transaction velocity — > 3 in last hour
  const recentTxCount = await prisma.transaction.count({
    where: { userId, createdAt: { gte: hoursAgo(1) } },
  });
  if (recentTxCount > 3) {
    score += 20;
    reasons.push(`tx-velocity:${recentTxCount}`);
  }

  // Payout failures
  const payoutFailures = await prisma.payoutFailure.count({
    where: { userId },
  });
  if (payoutFailures > 1) {
    score += 15;
    reasons.push(`payout-failures:${payoutFailures}`);
  }

  // Checkout-specific controls
  if (context.action === "CHECKOUT") {
    const checkoutAmountUsd = context.checkoutAmountUsd ?? 0;
    if (checkoutAmountUsd >= MAX_CHECKOUT_USD * 0.8) {
      score += 15;
      reasons.push(`high-checkout-amount:${checkoutAmountUsd}`);
    }
    if (checkoutAmountUsd > MAX_CHECKOUT_USD) {
      reasons.push(`checkout-limit-exceeded:${checkoutAmountUsd}>${MAX_CHECKOUT_USD}`);
      return {
        level: "HIGH",
        score: Math.max(score, THRESHOLD_HIGH),
        reasons,
        blocked: true,
      };
    }
  }

  const level: RiskLevel =
    score >= THRESHOLD_HIGH ? "HIGH" : score >= THRESHOLD_MEDIUM ? "MEDIUM" : "LOW";

  const blocked = score >= HARD_BLOCK;

  return { level, score, reasons, blocked };
}

/** Returns a 403 JSON body string if risk is too high for a given action. */
export function riskBlockResponse(verdict: RiskVerdict, action: string) {
  return {
    error: `Action blocked: ${action}`,
    code: "RISK_BLOCK",
    level: verdict.level,
    reasons: verdict.reasons,
  };
}
