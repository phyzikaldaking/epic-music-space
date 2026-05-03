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

function reqWithHeaders(headers: Record<string, string>) {
  return {
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
  } as any;
}

describe("withRateLimit", () => {
  beforeEach(() => {
    (__nextResponseJson as any).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses x-forwarded-for first IP when present", async () => {
    const consumeSpy = vi.spyOn(strictLimiter as any, "consume").mockResolvedValue(undefined);
    const handler = vi.fn(async (_req, ctx) => ({ ok: true, key: ctx.key }));
    const wrapped = withRateLimit(strictLimiter, handler as any);

    const req = reqWithHeaders({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    const res = await wrapped(req);

    expect(consumeSpy).toHaveBeenCalledWith("1.2.3.4");
    expect(handler).toHaveBeenCalledTimes(1);
    expect((res as any).key).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for absent", async () => {
    const consumeSpy = vi.spyOn(strictLimiter as any, "consume").mockResolvedValue(undefined);
    const handler = vi.fn(async (_req, ctx) => ({ ok: true, key: ctx.key }));
    const wrapped = withRateLimit(strictLimiter, handler as any);

    const req = reqWithHeaders({ "x-real-ip": "9.9.9.9" });
    const res = await wrapped(req);

    expect(consumeSpy).toHaveBeenCalledWith("9.9.9.9");
    expect((res as any).key).toBe("9.9.9.9");
  });

  it("returns 429 when limiter throws", async () => {
    vi.spyOn(strictLimiter as any, "consume").mockRejectedValue(new Error("rate limited"));
    const handler = vi.fn(async () => ({ ok: true }));
    const wrapped = withRateLimit(strictLimiter, handler as any);

    const req = reqWithHeaders({ "x-real-ip": "9.9.9.9" });
    const res = await wrapped(req);

    expect(handler).not.toHaveBeenCalled();
    expect(__nextResponseJson).toHaveBeenCalledTimes(1);
    expect((res as any).status).toBe(429);
    expect((res as any).headers["Retry-After"]).toBe("60");
  });
});
