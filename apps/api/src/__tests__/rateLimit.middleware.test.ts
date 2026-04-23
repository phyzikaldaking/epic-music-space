/**
 * Tests for the rateLimit middleware helper.
 *
 * We pass a hand-crafted limiter object to rateLimit() so we can control when
 * consume() resolves (pass-through) or rejects (rate-limit exceeded).
 */

import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { rateLimit } from "../middleware/rateLimit";

type MockLimiter = { consume: ReturnType<typeof vi.fn> };

function buildApp(limiter: MockLimiter) {
  const app = new Hono();
  // Cast to match the expected type — only consume() matters
  app.use("*", rateLimit(limiter as never));
  app.get("/ping", (c) => c.json({ ok: true }));
  return app;
}

describe("rateLimit middleware", () => {
  it("calls next and returns the handler response when under the limit", async () => {
    const limiter: MockLimiter = { consume: vi.fn().mockResolvedValue(undefined) };
    const app = buildApp(limiter);

    const res = await app.request("/ping", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    expect(res.status).toBe(200);
    expect(limiter.consume).toHaveBeenCalledWith("1.2.3.4");
  });

  it("returns 429 when the limiter throws (rate-limit exceeded)", async () => {
    const limiter: MockLimiter = {
      consume: vi.fn().mockRejectedValue(new Error("Rate limit exceeded")),
    };
    const app = buildApp(limiter);

    const res = await app.request("/ping", {
      headers: { "x-forwarded-for": "5.6.7.8" },
    });

    expect(res.status).toBe(429);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/too many requests/i);
  });

  it("uses x-real-ip when x-forwarded-for is absent", async () => {
    const limiter: MockLimiter = { consume: vi.fn().mockResolvedValue(undefined) };
    const app = buildApp(limiter);

    await app.request("/ping", {
      headers: { "x-real-ip": "9.10.11.12" },
    });

    expect(limiter.consume).toHaveBeenCalledWith("9.10.11.12");
  });

  it("falls back to 'unknown' when no IP header is present", async () => {
    const limiter: MockLimiter = { consume: vi.fn().mockResolvedValue(undefined) };
    const app = buildApp(limiter);

    await app.request("/ping");

    expect(limiter.consume).toHaveBeenCalledWith("unknown");
  });

  it("trims the first segment from a comma-separated x-forwarded-for header", async () => {
    const limiter: MockLimiter = { consume: vi.fn().mockResolvedValue(undefined) };
    const app = buildApp(limiter);

    await app.request("/ping", {
      headers: { "x-forwarded-for": " 10.0.0.1 , 10.0.0.2" },
    });

    expect(limiter.consume).toHaveBeenCalledWith("10.0.0.1");
  });
});
