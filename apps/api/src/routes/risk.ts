import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { recordRiskEvent } from "../middleware/riskScoring";

// ─────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────

const riskEventSchema = z.object({
  eventType: z.string().min(1),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  targetUserId: z.string().optional(),
  songId: z.string().optional(),
  transactionId: z.string().optional(),
  reason: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateScoreSchema = z.object({
  delta: z.number().int().min(-100).max(100),
  reason: z.string().optional(),
});

// ─────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────

type ApiVariables = {
  Variables: {
    userId: string;
  };
};

export const riskRouter = new Hono<ApiVariables>();

// ── POST /api/risk/events ───────────────────────────────────────────────────

/**
 * Records a risk event and optionally updates the target user's suspicionScore.
 * Requires admin or artist role.
 */
riskRouter.post(
  "/events",
  authMiddleware,
  async (c) => {
    const userId = c.get("userId");

    // ── Role check ─────────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    if (!["ADMIN", "ARTIST", "PRODUCER", "ENGINEER"].includes(user.role)) {
      return c.json({ error: "Insufficient permissions" }, 403);
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = riskEventSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        400
      );
    }

    const { targetUserId, ...eventData } = parsed.data;

    // Record the event
    await recordRiskEvent(prisma, {
      ...eventData,
      actorUserId: userId,
    });

    // If targetUserId provided, return updated suspicionScore
    if (targetUserId) {
      const target = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { suspicionScore: true },
      });
      return c.json({
        success: true,
        targetUserId,
        suspicionScore: target?.suspicionScore ?? 0,
      });
    }

    return c.json({ success: true }, 201);
  }
);

// ── POST /api/risk/users/:userId/score ─────────────────────────────────────

/**
 * Manually updates a user's suspicionScore. Admin only.
 */
riskRouter.post(
  "/users/:userId/score",
  authMiddleware,
  async (c) => {
    const userId = c.get("userId");

    // ── Admin check ─────────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user || user.role !== "ADMIN") {
      return c.json({ error: "Admin access required" }, 403);
    }

    const targetUserId = c.req.param("userId");

    // ── Parse body ─────────────────────────────────────────────────────────
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = updateScoreSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        400
      );
    }

    const { delta, reason } = parsed.data;

    // Update user score
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        suspicionScore: { increment: delta },
        ...(delta > 0 ? { flaggedAt: new Date() } : {}),
        ...(reason ? { suspendedReason: reason } : {}),
      },
      select: { suspicionScore: true, flaggedAt: true },
    });

    // Record admin action in RiskEvent
    await recordRiskEvent(prisma, {
      eventType: "admin_score_update",
      severity: updatedUser.suspicionScore >= 75 ? "HIGH" : "MEDIUM",
      actorUserId: userId,
      targetUserId,
      reason: reason ?? "Manual score adjustment",
      metadata: { delta },
    });

    return c.json({
      success: true,
      userId: targetUserId,
      suspicionScore: updatedUser.suspicionScore,
      flaggedAt: updatedUser.flaggedAt,
    });
  }
);

// ── GET /api/risk/users/:userId/status ─────────────────────────────────────

/**
 * Returns the current risk status for a user.
 * Admin or self only.
 */
riskRouter.get("/users/:userId/status", authMiddleware, async (c) => {
  const requestingUserId = c.get("userId");
  const targetUserId = c.req.param("userId");

  // ── Authorization check ──────────────────────────────────────────────────
  if (requestingUserId !== targetUserId) {
    const requester = await prisma.user.findUnique({
      where: { id: requestingUserId },
      select: { role: true },
    });
    if (!requester || requester.role !== "ADMIN") {
      return c.json({ error: "Unauthorized" }, 403);
    }
  }

  // ── Fetch user ───────────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      suspicionScore: true,
      isSuspended: true,
      suspendedAt: true,
      flaggedAt: true,
    },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // ── Recent transaction velocity ─────────────────────────────────────────
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [hourTx, dayTx] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: targetUserId, createdAt: { gte: hourAgo } },
    }),
    prisma.transaction.findMany({
      where: { userId: targetUserId, createdAt: { gte: dayAgo } },
    }),
  ]);

  // ── Static risk level calculation ────────────────────────────────────────
  let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "BLOCKED" = "LOW";
  if (user.suspicionScore >= 100 || user.isSuspended) {
    riskLevel = "BLOCKED";
  } else if (user.suspicionScore >= 50) {
    riskLevel = "HIGH";
  } else if (user.suspicionScore >= 25) {
    riskLevel = "MEDIUM";
  }

  return c.json({
    userId: targetUserId,
    riskLevel,
    suspicionScore: user.suspicionScore,
    flaggedAt: user.flaggedAt,
    isSuspended: user.isSuspended,
    suspendedAt: user.suspendedAt,
    velocity: {
      hour: { count: hourTx.length, amount: hourTx.reduce((s, t) => s + Number(t.amount), 0) },
      day: { count: dayTx.length, amount: dayTx.reduce((s, t) => s + Number(t.amount), 0) },
    },
  });
});

// ── GET /api/risk/events ───────────────────────────────────────────────────

/**
 * Lists recent risk events (admin only).
 */
riskRouter.get("/events", authMiddleware, async (c) => {
  const userId = c.get("userId");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user || user.role !== "ADMIN") {
    return c.json({ error: "Admin access required" }, 403);
  }

  const limit = Math.min(Number(c.req.query("limit") || "50"), 100);
  const offset = Number(c.req.query("offset") || "0");
  const eventType = c.req.query("eventType");
  const severity = c.req.query("severity");

  const where: Record<string, unknown> = {};
  if (eventType) where.eventType = eventType;
  if (severity) where.severity = severity;

  const [events, total] = await Promise.all([
    prisma.riskEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.riskEvent.count({ where }),
  ]);

  return c.json({
    events,
    total,
    limit,
    offset,
  });
});
