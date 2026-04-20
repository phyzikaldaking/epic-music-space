import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth";

// Helper: build a minimal Hono test app that uses authMiddleware on GET /protected
function buildApp() {
  const app = new Hono();
  app.get("/protected", authMiddleware, (c) => {
    return c.json({ userId: c.get("userId") });
  });
  return app;
}

describe("authMiddleware", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env before each test
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NODE_ENV;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Restore original env
    Object.assign(process.env, originalEnv);
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
  });

  describe("development bypass (no Supabase config)", () => {
    it("returns 401 when x-ems-user-id header is missing", async () => {
      const app = buildApp();
      const res = await app.request("/protected", {
        method: "GET",
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("sets userId and calls next when x-ems-user-id header is present", async () => {
      const app = buildApp();
      const res = await app.request("/protected", {
        method: "GET",
        headers: { "x-ems-user-id": "dev-user-123" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ userId: "dev-user-123" });
    });

    it("returns 500 in production when Supabase is not configured", async () => {
      process.env.NODE_ENV = "production";
      const app = buildApp();
      const res = await app.request("/protected", {
        method: "GET",
        headers: { "x-ems-user-id": "dev-user-123" },
      });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual({ error: "Auth not configured" });
    });
  });

  describe("Supabase JWT verification", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    });

    it("returns 401 when Authorization header is missing", async () => {
      const app = buildApp();
      const res = await app.request("/protected", {
        method: "GET",
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("returns 401 when Supabase rejects a whitespace-only token", async () => {
      // Hono normalises "Bearer " to "Bearer" (strips trailing space).
      // The regex requires \s+ so it does not match, and the raw string "Bearer"
      // is forwarded to Supabase as the token. Supabase rejects it.
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
      );

      const app = buildApp();
      const res = await app.request("/protected", {
        method: "GET",
        headers: { Authorization: "Bearer " },
      });
      expect(res.status).toBe(401);
    });

    it("returns 401 when Supabase responds with non-ok status", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
      );

      const app = buildApp();
      const res = await app.request("/protected", {
        method: "GET",
        headers: { Authorization: "Bearer invalid-token" },
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("returns 401 when Supabase returns a user without an id", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ email: "test@example.com" }), // no id field
        })
      );

      const app = buildApp();
      const res = await app.request("/protected", {
        method: "GET",
        headers: { Authorization: "Bearer some-token" },
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("sets userId and calls next when Supabase returns valid user", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ id: "supabase-user-abc" }),
        })
      );

      const app = buildApp();
      const res = await app.request("/protected", {
        method: "GET",
        headers: { Authorization: "Bearer valid-token" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ userId: "supabase-user-abc" });
    });

    it("calls Supabase with correct headers", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "user-xyz" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const app = buildApp();
      await app.request("/protected", {
        method: "GET",
        headers: { Authorization: "Bearer my-jwt-token" },
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://test.supabase.co/auth/v1/user",
        {
          headers: {
            Authorization: "Bearer my-jwt-token",
            apikey: "test-anon-key",
          },
        }
      );
    });

    it("returns 503 when fetch throws (Supabase unavailable)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network error"))
      );

      const app = buildApp();
      const res = await app.request("/protected", {
        method: "GET",
        headers: { Authorization: "Bearer some-token" },
      });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body).toEqual({ error: "Auth service unavailable" });
    });

    it("strips Bearer prefix case-insensitively before passing token", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "user-case-test" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const app = buildApp();
      await app.request("/protected", {
        method: "GET",
        headers: { Authorization: "BEARER case-insensitive-token" },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer case-insensitive-token",
          }),
        })
      );
    });
  });
});
