import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const checkAdminIpAllowlistMock = vi.hoisted(() => vi.fn());
const logAdminActionMock = vi.hoisted(() => vi.fn());

const txMock = vi.hoisted(() => ({
  user: { updateMany: vi.fn() },
  riskEvent: { update: vi.fn() },
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  user: { findUnique: vi.fn() },
  riskEvent: { findUnique: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/adminGuard", () => ({ checkAdminIpAllowlist: checkAdminIpAllowlistMock }));
vi.mock("@/lib/adminAudit", () => ({
  ipFromRequest: () => "203.0.113.10",
  logAdminAction: logAdminActionMock,
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { PATCH } from "@/app/api/admin/risk/[id]/route";

describe("PATCH /api/admin/risk/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", email: "admin@example.com" } });
    checkAdminIpAllowlistMock.mockReturnValue(null);
    logAdminActionMock.mockResolvedValue(undefined);
    prismaMock.user.findUnique.mockResolvedValue({ email: "admin@example.com" });
    prismaMock.riskEvent.findUnique.mockResolvedValue({
      id: "risk-1",
      eventType: "fake_vote",
      severity: "HIGH",
      actorUserId: "user-1",
      targetUserId: null,
      metadata: {},
      reason: "vote_rate_limited",
    });
    prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));
    txMock.riskEvent.update.mockResolvedValue({ id: "risk-1", status: "ACTIONED" });
  });

  it("flags the event subject and marks the risk event actioned", async () => {
    const res = await PATCH(
      new NextRequest("https://epicmusicspace.com/api/admin/risk/risk-1", {
        method: "PATCH",
        body: JSON.stringify({ action: "flag_user", note: "vote cluster" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "risk-1" }) },
    );

    expect(res.status).toBe(200);
    expect(txMock.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({
          flaggedAt: expect.any(Date),
          suspicionScore: { increment: 25 },
        }),
      }),
    );
    expect(txMock.riskEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ACTIONED" }),
      }),
    );
    expect(logAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "risk.flag_user", target: "risk-1" }),
    );
  });
});
