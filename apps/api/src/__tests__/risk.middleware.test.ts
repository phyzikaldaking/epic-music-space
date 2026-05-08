import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  transaction: { findMany: vi.fn() },
  riskEvent: { create: vi.fn() },
}));

vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

import { riskScoringMiddleware, recordRiskEvent } from "../middleware/riskScoring";

function buildRiskApp(userId?: string) {
  const app = new Hono<{
    Variables: { userId?: string; riskAssessment?: unknown };
  }>();

  app.use("*", async (c, next) => {
    if (userId) c.set("userId", userId);
    await next();
  });
  app.use("*", riskScoringMiddleware);

  app.get("/health", (c) => c.json({ ok: true }));
  app.post("/api/market/buy", (c) =>
    c.json({ ok: true, riskAssessment: c.get("riskAssessment") ?? null })
  );

  return app;
}

describe("riskScoringMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.transaction.findMany.mockResolvedValue([]);
    prismaMock.riskEvent.create.mockResolvedValue({});
    prismaMock.user.update.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips scoring for non-checkout routes", async () => {
    const app = buildRiskApp("buyer-1");
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns 401 when userId is missing", async () => {
    const app = buildRiskApp(undefined);
    const res = await app.request("/api/market/buy", { method: "POST" });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when user does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const app = buildRiskApp("buyer-1");
    const res = await app.request("/api/market/buy", { method: "POST" });

    expect(res.status).toBe(404);
  });

  it("returns 403 when account is suspended", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      suspicionScore: 0,
      isSuspended: true,
      suspendedAt: new Date(),
    });
    const app = buildRiskApp("buyer-1");
    const res = await app.request("/api/market/buy", { method: "POST" });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/suspended/i);
  });

  it("blocks checkout when suspicion score is critical", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      suspicionScore: 100,
      isSuspended: false,
      suspendedAt: null,
    });
    prismaMock.transaction.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const app = buildRiskApp("high-risk-user");
    const res = await app.request("/api/market/buy", { method: "POST" });

    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      error: string;
      risk: { level: string; reasons: string[] };
    };
    expect(body.risk.level).toBe("BLOCKED");
    expect(body.risk.reasons).toContain("suspicion_score_critical");
    expect(prismaMock.riskEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "checkout_blocked",
          actorUserId: "high-risk-user",
        }),
      })
    );
  });

  it("attaches assessment and continues for non-blocking risk", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      suspicionScore: 50,
      isSuspended: false,
      suspendedAt: null,
    });
    prismaMock.transaction.findMany
      .mockResolvedValueOnce([{ amount: 10 }])
      .mockResolvedValueOnce([{ amount: 10 }, { amount: 20 }]);

    const app = buildRiskApp("buyer-1");
    const res = await app.request("/api/market/buy", { method: "POST" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      riskAssessment: { level: string; reasons: string[]; blocked: boolean };
    };
    expect(body.riskAssessment.level).toBe("MEDIUM");
    expect(body.riskAssessment.blocked).toBe(false);
    expect(body.riskAssessment.reasons).toContain("suspicion_score_high");
  });

  it("fails open and proceeds when scoring throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.user.findUnique.mockRejectedValue(new Error("db down"));

    const app = buildRiskApp("buyer-1");
    const res = await app.request("/api/market/buy", { method: "POST" });

    expect(res.status).toBe(200);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("recordRiskEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.riskEvent.create.mockResolvedValue({});
    prismaMock.user.update.mockResolvedValue({});
  });

  it("creates an event and updates target score with severity delta", async () => {
    await recordRiskEvent(prismaMock as never, {
      eventType: "manual_review",
      severity: "HIGH",
      actorUserId: "admin-1",
      targetUserId: "user-2",
      reason: "suspicious activity",
      metadata: { source: "test" },
    });

    expect(prismaMock.riskEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "manual_review",
          severity: "HIGH",
          actorUserId: "admin-1",
          targetUserId: "user-2",
        }),
      })
    );
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-2" },
        data: expect.objectContaining({
          suspicionScore: { increment: 20 },
          flaggedAt: expect.any(Date),
        }),
      })
    );
  });

  it("creates an event without touching user score when targetUserId is absent", async () => {
    await recordRiskEvent(prismaMock as never, {
      eventType: "ip_mismatch",
      severity: "LOW",
      actorUserId: "system",
    });

    expect(prismaMock.riskEvent.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
