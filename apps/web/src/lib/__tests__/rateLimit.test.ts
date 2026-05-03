import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must mock dependencies BEFORE importing rateLimit module.
vi.mock("../redis", () => ({
  getRedis: vi.fn(() => null),
}));

vi.mock("next/server", () => {
  const json = vi.fn(
    (
      body: unknown,
      init?: { status?: number; headers?: Record<string, string> },
    ) => ({
      body,
      status: init?.status ?? 200,
      headers: init?.headers ?? {},
    }),
  );

  return {
    NextResponse: {
      json,
    },
    // expose for assertions
    __nextResponseJson: json,
  };
});

import { withRateLimit, strictLimiter } from "../rateLimit";

import { __nextResponseJson } from "next/server";

type MinimalNextRequest = {
  headers: {
    get(key: string): string | null;
  };
};

type RateLimitContext = { key: string };
type MinimalNextResponse = { status: number; headers: Record<string, string> };

function reqWithHeaders(headers: Record<string, string>) {
  return {
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
  } satisfies MinimalNextRequest;
}

describe("withRateLimit", () => {
  beforeEach(() => {
    __nextResponseJson.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses x-forwarded-for first IP when present", async () => {
    const limiter = strictLimiter as unknown as { consume: (key: string) => Promise<unknown> };
    const consumeSpy = vi.spyOn(limiter, "consume").mockResolvedValue(undefined);

    const handler = vi.fn(async (_req: MinimalNextRequest, ctx: RateLimitContext) => ({
      ok: true,
      key: ctx.key,
    }));

    const wrapped = withRateLimit(
      strictLimiter,
      handler as unknown as (req: unknown, ctx: RateLimitContext) => Promise<MinimalNextResponse>,
    );

    const req = reqWithHeaders({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    const res = await wrapped(req);

    expect(consumeSpy).toHaveBeenCalledWith("1.2.3.4");
    expect(handler).toHaveBeenCalledTimes(1);
    expect((res as unknown as { key: string }).key).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for absent", async () => {
    const limiter = strictLimiter as unknown as { consume: (key: string) => Promise<unknown> };
    const consumeSpy = vi.spyOn(limiter, "consume").mockResolvedValue(undefined);

    const handler = vi.fn(async (_req: MinimalNextRequest, ctx: RateLimitContext) => ({
      ok: true,
      key: ctx.key,
    }));

    const wrapped = withRateLimit(
      strictLimiter,
      handler as unknown as (req: unknown, ctx: RateLimitContext) => Promise<MinimalNextResponse>,
    );

    const req = reqWithHeaders({ "x-real-ip": "9.9.9.9" });
    const res = await wrapped(req);

    expect(consumeSpy).toHaveBeenCalledWith("9.9.9.9");
    expect((res as unknown as { key: string }).key).toBe("9.9.9.9");
  });

  it("returns 429 when limiter throws", async () => {
    const limiter = strictLimiter as unknown as { consume: (key: string) => Promise<unknown> };
    vi.spyOn(limiter, "consume").mockRejectedValue(new Error("rate limited"));

    const handler = vi.fn(async () => ({ ok: true }));
    const wrapped = withRateLimit(
      strictLimiter,
      handler as unknown as (req: unknown, ctx: RateLimitContext) => Promise<MinimalNextResponse>,
    );

    const req = reqWithHeaders({ "x-real-ip": "9.9.9.9" });
    const res = await wrapped(req);

    expect(handler).not.toHaveBeenCalled();
    expect(__nextResponseJson).toHaveBeenCalledTimes(1);
    expect((res as unknown as MinimalNextResponse).status).toBe(429);
    expect((res as unknown as MinimalNextResponse).headers["Retry-After"]).toBe("60");
  });
});
