import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRawMock = vi.hoisted(() => vi.fn());
const getCriticalEnvironmentHealthReportMock = vi.hoisted(() => vi.fn());
const redisPingMock = vi.hoisted(() => vi.fn());
const getRedisMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: queryRawMock,
  },
}));

vi.mock("@/lib/criticalEnv", () => ({
  getCriticalEnvironmentHealthReport: getCriticalEnvironmentHealthReportMock,
}));

vi.mock("@/lib/redis", () => ({
  getRedis: getRedisMock,
}));

import { GET } from "@/app/api/health/ready/route";

describe("GET /api/health/ready", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRedisMock.mockReturnValue({ ping: redisPingMock });
    redisPingMock.mockResolvedValue("PONG");
  });

  it("returns 200 when environment is healthy and database responds", async () => {
    getCriticalEnvironmentHealthReportMock.mockReturnValue({
      envName: "production",
      isProductionLike: true,
      issues: [],
      status: "ok",
    });
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.database.ok).toBe(true);
    expect(body.checks.redis.ok).toBe(true);
  });

  it("returns 503 when database is down even with clean env", async () => {
    getCriticalEnvironmentHealthReportMock.mockReturnValue({
      envName: "production",
      isProductionLike: true,
      issues: [],
      status: "ok",
    });
    queryRawMock.mockRejectedValue(new Error("connection refused"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("down");
    expect(body.checks.database.ok).toBe(false);
  });

  it("returns 503 when production Redis is required but unavailable", async () => {
    getCriticalEnvironmentHealthReportMock.mockReturnValue({
      envName: "production",
      isProductionLike: true,
      issues: [],
      status: "ok",
    });
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    getRedisMock.mockReturnValue(null);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("down");
    expect(body.checks.redis.required).toBe(true);
    expect(body.checks.redis.configured).toBe(false);
  });
});
