import { createHash } from "crypto";
import { Prisma } from "@ems/db";
import { prisma } from "@/lib/prisma";

export type RiskEventType =
  | "suspicious_signup"
  | "fake_play"
  | "fake_vote"
  | "failed_payment"
  | "content_report";

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RiskStatus = "OPEN" | "DISMISSED" | "ESCALATED" | "ACTIONED";

type RecordRiskEventInput = {
  eventType: RiskEventType;
  severity?: RiskSeverity;
  actorUserId?: string | null;
  targetUserId?: string | null;
  songId?: string | null;
  reportId?: string | null;
  transactionId?: string | null;
  ip?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function hashRiskIp(ip?: string | null): string | null {
  if (!ip || ip === "unknown") return null;
  const salt = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-risk-event-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function suspicionDelta(input: RecordRiskEventInput) {
  const base = input.severity === "CRITICAL" ? 45 : input.severity === "HIGH" ? 25 : input.severity === "MEDIUM" ? 10 : 2;
  const multiplier =
    input.eventType === "fake_play" ? 1.2 :
    input.eventType === "fake_vote" ? 1 :
    input.eventType === "failed_payment" ? 0.8 :
    input.eventType === "suspicious_signup" ? 1.4 :
    0.5;
  return Math.max(1, Math.round(base * multiplier));
}

export async function recordRiskEvent(input: RecordRiskEventInput) {
  if (!process.env.DATABASE_URL && process.env.NODE_ENV === "production") {
    console.warn("[risk-event] DATABASE_URL missing; risk event not persisted", input.eventType);
    return null;
  }

  try {
    const event = await prisma.riskEvent.create({
      data: {
        eventType: input.eventType,
        severity: input.severity ?? "LOW",
        actorUserId: input.actorUserId ?? null,
        targetUserId: input.targetUserId ?? null,
        songId: input.songId ?? null,
        reportId: input.reportId ?? null,
        transactionId: input.transactionId ?? null,
        ipHash: hashRiskIp(input.ip),
        reason: input.reason ?? null,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonObject) : undefined,
      },
    });

    const subjectUserId = input.actorUserId ?? input.targetUserId ?? null;
    if (subjectUserId && (input.severity === "MEDIUM" || input.severity === "HIGH" || input.severity === "CRITICAL")) {
      const delta = suspicionDelta(input);
      await prisma.user.updateMany({
        where: { id: subjectUserId },
        data: {
          suspicionScore: { increment: delta },
          ...(input.severity === "HIGH" || input.severity === "CRITICAL"
            ? { flaggedAt: new Date() }
            : {}),
        },
      });
    }

    return event;
  } catch (error) {
    console.error("[risk-event] persist failed", error);
    return null;
  }
}

export async function getRiskEventSummary() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [recent, byType24h, bySeverity24h, highRisk7d] = await Promise.all([
    prisma.riskEvent.findMany({
      where: { status: { not: "DISMISSED" } },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    prisma.riskEvent.groupBy({
      by: ["eventType"],
      where: { createdAt: { gte: since24h }, status: { not: "DISMISSED" } },
      _count: { _all: true },
    }),
    prisma.riskEvent.groupBy({
      by: ["severity"],
      where: { createdAt: { gte: since24h }, status: { not: "DISMISSED" } },
      _count: { _all: true },
    }),
    prisma.riskEvent.count({
      where: { createdAt: { gte: since7d }, severity: { in: ["HIGH", "CRITICAL"] }, status: { not: "DISMISSED" } },
    }),
  ]);

  return {
    recent,
    byType24h,
    bySeverity24h,
    highRisk7d,
  };
}
