import type { Context, Next } from "hono";
import { prisma } from "../lib/prisma";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  reasons: string[];
  suspicionScore: number;
  velocity: {
    hourCount: number;
    dayCount: number;
    hourAmount: number;
    dayAmount: number;
  };
  blocked: boolean;
}

export interface RiskRule {
  name: string;
  check: (assessment: RiskAssessment, user: { suspicionScore: number }) => boolean;
  severity: RiskLevel;
}

// ─────────────────────────────────────────────────────────
// Risk rules
// ─────────────────────────────────────────────────────────

const RULES: RiskRule[] = [
  {
    name: "suspicion_score_critical",
    severity: "BLOCKED",
    check: (_, user) => user.suspicionScore >= 100,
  },
  {
    name: "suspicion_score_very_high",
    severity: "HIGH",
    check: (_, user) => user.suspicionScore >= 75,
  },
  {
    name: "suspicion_score_high",
    severity: "MEDIUM",
    check: (_, user) => user.suspicionScore >= 50,
  },
  {
    name: "suspicion_score_medium",
    severity: "LOW",
    check: (_, user) => user.suspicionScore >= 25,
  },
  {
    name: "velocity_hour_count_high",
    severity: "HIGH",
    check: (a) => a.velocity.hourCount >= 10,
  },
  {
    name: "velocity_hour_count_medium",
    severity: "MEDIUM",
    check: (a) => a.velocity.hourCount >= 5,
  },
  {
    name: "velocity_day_count_high",
    severity: "MEDIUM",
    check: (a) => a.velocity.dayCount >= 30,
  },
  {
    name: "velocity_hour_amount_high",
    severity: "HIGH",
    check: (a) => a.velocity.hourAmount >= 5000,
  },
  {
    name: "velocity_day_amount_very_high",
    severity: "BLOCKED",
    check: (a) => a.velocity.dayAmount >= 20000,
  },
  {
    name: "velocity_day_amount_high",
    severity: "HIGH",
    check: (a) => a.velocity.dayAmount >= 10000,
  },
];

// ─────────────────────────────────────────────────────────
// Velocity thresholds
// ─────────────────────────────────────────────────────────

const VELOCITY_WINDOW_HOUR = 60 * 60 * 1000; // 1 hour in ms
const VELOCITY_WINDOW_DAY = 24 * 60 * 60 * 1000; // 24 hours in ms

// ─────────────────────────────────────────────────────────
// Main middleware
// ─────────────────────────────────────────────────────────

/**
 * riskScoringMiddleware
 *
 * Evaluates checkout risk based on:
 *   • User's baseline suspicionScore from the DB
 *   • Recent transaction velocity (count + amount in last hour/day)
 *   • Configurable rule thresholds
 *
 * The resulting RiskAssessment is stored in `c.var.risk` and can be
 * inspected by downstream handlers.  If `blocked` is true the request
 * is terminated immediately with a 403 response.
 */
export async function riskScoringMiddleware(c: Context, next: Next) {
  // Skip risk scoring for non-checkout routes
  const path = c.req.path;
  if (!path.startsWith("/api/market/buy")) {
    return next();
  }

  const userId = c.get("userId");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // ── Fetch user ──────────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { suspicionScore: true, isSuspended: true, suspendedAt: true },
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    if (user.isSuspended && user.suspendedAt) {
      return c.json(
        { error: "Account suspended", reason: "Account is suspended" },
        403
      );
    }

    // ── Calculate transaction velocity ─────────────────────────────────────
    const now = new Date();
    const hourAgo = new Date(now.getTime() - VELOCITY_WINDOW_HOUR);
    const dayAgo = new Date(now.getTime() - VELOCITY_WINDOW_DAY);

    const [hourTx, dayTx] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          userId,
          createdAt: { gte: hourAgo },
        },
        select: { amount: true },
      }),
      prisma.transaction.findMany({
        where: {
          userId,
          createdAt: { gte: dayAgo },
        },
        select: { amount: true },
      }),
    ]);

    const hourCount = hourTx.length;
    const dayCount = dayTx.length;
    const hourAmount = hourTx.reduce((sum, tx) => sum + Number(tx.amount), 0);
    const dayAmount = dayTx.reduce((sum, tx) => sum + Number(tx.amount), 0);

    // ── Build assessment ────────────────────────────────────────────────────
    const assessment: RiskAssessment = {
      level: "LOW",
      score: user.suspicionScore,
      reasons: [],
      suspicionScore: user.suspicionScore,
      velocity: { hourCount, dayCount, hourAmount, dayAmount },
      blocked: false,
    };

    // ── Apply rules ─────────────────────────────────────────────────────────
    for (const rule of RULES) {
      if (rule.check(assessment, user)) {
        assessment.reasons.push(rule.name);
        if (rule.severity === "BLOCKED") {
          assessment.blocked = true;
          assessment.level = "BLOCKED";
          break;
        } else if (
          (rule.severity === "HIGH" && assessment.level !== "BLOCKED") ||
          (rule.severity === "MEDIUM" && assessment.level === "LOW") ||
          (rule.severity === "LOW" && assessment.level === "LOW")
        ) {
          assessment.level = rule.severity;
        }
      }
    }

    // ── Store in context ────────────────────────────────────────────────────
    c.set("riskAssessment", assessment);

    // ── Block if needed ─────────────────────────────────────────────────────
    if (assessment.blocked) {
      await recordRiskEvent(prisma, {
        eventType: "checkout_blocked",
        severity: "HIGH",
        actorUserId: userId,
        reason: "Automated risk block",
        metadata: {
          suspicionScore: user.suspicionScore,
          velocity: assessment.velocity,
          reasons: assessment.reasons,
        },
      });

      return c.json(
        {
          error: "Transaction blocked due to risk",
          risk: {
            level: assessment.level,
            reasons: assessment.reasons,
          },
        },
        403
      );
    }

    return next();
  } catch (error) {
    console.error("[risk] scoring failed:", error);
    // On error, allow the request to proceed but log
    return next();
  }
}

// ─────────────────────────────────────────────────────────
// Risk event recording
// ─────────────────────────────────────────────────────────

export type RiskEventInput = {
  eventType: string;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  actorUserId?: string;
  targetUserId?: string;
  songId?: string;
  transactionId?: string;
  ipHash?: string;
  reason?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
};

/**
 * Records a risk event and updates the target user's suspicionScore.
 * Call this from webhooks, admin actions, or automated detection.
 */
export async function recordRiskEvent(
  db: typeof prisma,
  {
    eventType,
    severity = "LOW",
    actorUserId,
    targetUserId,
    songId,
    transactionId,
    ipHash,
    reason,
    metadata,
  }: RiskEventInput
) {
  // Create RiskEvent
  await db.riskEvent.create({
    data: {
      eventType,
      severity,
      actorUserId: actorUserId ?? undefined,
      targetUserId: targetUserId ?? undefined,
      songId: songId ?? undefined,
      transactionId: transactionId ?? undefined,
      ipHash: ipHash ?? undefined,
      reason: reason ?? undefined,
      metadata,
    },
  });

  // Update suspicionScore if targetUserId provided
  if (targetUserId) {
    const scoreDelta = getScoreDelta(severity);
    await db.user.update({
      where: { id: targetUserId },
      data: {
        suspicionScore: { increment: scoreDelta },
        ...(scoreDelta > 0 && {
          flaggedAt: new Date(),
        }),
      },
    });
  }
}

function getScoreDelta(severity: string): number {
  switch (severity) {
    case "CRITICAL":
      return 50;
    case "HIGH":
      return 20;
    case "MEDIUM":
      return 10;
    case "LOW":
    default:
      return 5;
  }
}
