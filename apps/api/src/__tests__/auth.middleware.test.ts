/**
 * Tests for authMiddleware
 *
 * The middleware has two operating modes:
 *  1. Dev-bypass: NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set → trust x-ems-user-id header
 *  2. Supabase JWT: env vars set → verify Bearer token against Supabase /auth/v1/user
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";

// Helper: build a minimal Hono app that exercises the middleware
function buildApp() {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use("*", authMiddleware);
  app.get("/protected", (c) => c.json({ userId: c.get("userId") }));
  return app;
}

// ---------------------------------------------------------------------------
// Dev-bypass mode (no Supabase env vars)
// ---------------------------------------------------------------------------

describe("authMiddleware — dev bypass mode", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NODE_ENV = "test";
  });

  it("returns 401 when x-ems-user-id header is absent", async () => {
    const app = buildApp();
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("sets userId and calls next when x-ems-user-id is present", async () => {
    const app = buildApp();
    const res = await app.request("/protected", {
      headers: { "x-ems-user-id": "user-123" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string };
    expect(body.userId).toBe("user-123");
  });

  it("returns 500 in production when Supabase is not configured", async () => {
    process.env.NODE_ENV = "production";
    const app = buildApp();
    const res = await app.request("/protected", {
      headers: { "x-ems-user-id": "user-123" },
    });
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Auth not configured");
    process.env.NODE_ENV = "test";
  });
});

// ---------------------------------------------------------------------------
// Supabase JWT mode
// ---------------------------------------------------------------------------

describe("authMiddleware — Supabase JWT mode", () => {
  const supabaseUrl = "https://test.supabase.co";
  const supabaseAnonKey = "test-anon-key";

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = supabaseAnonKey;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    vi.restoreAllMocks();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const app = buildApp();
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
  });

  it("returns 401 when Supabase responds with a non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
    );
    const app = buildApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer bad-token" },
    });
    expect(res.status).toBe(401);
    vi.unstubAllGlobals();
  });

  it("returns 401 when Supabase returns a user without an id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: undefined }),
      })
    );
    const app = buildApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer token-no-id" },
    });
    expect(res.status).toBe(401);
    vi.unstubAllGlobals();
  });

  it("sets userId and calls next on a valid Supabase token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "supabase-user-abc" }),
      })
    );
    const app = buildApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer valid-token" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string };
    expect(body.userId).toBe("supabase-user-abc");
    vi.unstubAllGlobals();
  });

  it("returns 503 when the Supabase fetch throws a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network failure"))
    );
    const app = buildApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer some-token" },
    });
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Auth service unavailable");
    vi.unstubAllGlobals();
  });

  it("strips the 'Bearer ' prefix before forwarding the token", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "user-xyz" }),
    });
    vi.stubGlobal("fetch", mockFetch);
    const app = buildApp();
    await app.request("/protected", {
      headers: { Authorization: "Bearer my-jwt-token" },
    });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toContain("/auth/v1/user");
    expect(init.headers.Authorization).toBe("Bearer my-jwt-token");
    vi.unstubAllGlobals();
  });
});
