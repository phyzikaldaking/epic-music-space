import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "./auth";

// ─────────────────────────────────────────────────────────
// Test app factory
// ─────────────────────────────────────────────────────────

function makeApp() {
  const app = new Hono();
  app.use("*", authMiddleware);
  app.get("/", (c) => c.json({ userId: c.get("userId") }));
  return app;
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/", { headers });
}

// ─────────────────────────────────────────────────────────
// Tests — development bypass (no Supabase env vars)
// ─────────────────────────────────────────────────────────

describe("authMiddleware — development bypass (no Supabase env vars)", () => {
  beforeEach(() => {
    // Ensure Supabase env vars are absent so dev bypass is active
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when x-ems-user-id header is missing", async () => {
    const app = makeApp();
    const res = await app.request(makeRequest());
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("sets userId and calls next when x-ems-user-id header is present", async () => {
    const app = makeApp();
    const res = await app.request(
      makeRequest({ "x-ems-user-id": "dev-user-42" })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string };
    expect(body.userId).toBe("dev-user-42");
  });

  it("returns 500 when NODE_ENV is production and Supabase is not configured", async () => {
    process.env.NODE_ENV = "production";
    const app = makeApp();
    const res = await app.request(
      makeRequest({ "x-ems-user-id": "dev-user-42" })
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Auth not configured");
    // Restore NODE_ENV
    process.env.NODE_ENV = "test";
  });
});

// ─────────────────────────────────────────────────────────
// Tests — Supabase JWT path
// ─────────────────────────────────────────────────────────

describe("authMiddleware — Supabase JWT verification", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    vi.restoreAllMocks();
  });

  it("returns 401 when Authorization header is absent", async () => {
    const app = makeApp();
    const res = await app.request(makeRequest());
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when Supabase returns a non-ok response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Invalid JWT" }), { status: 401 })
    );
    const app = makeApp();
    const res = await app.request(
      makeRequest({ Authorization: "Bearer bad-token" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when Supabase response has no id field", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "" }), { status: 200 })
    );
    const app = makeApp();
    const res = await app.request(
      makeRequest({ Authorization: "Bearer bad-token" })
    );
    expect(res.status).toBe(401);
  });

  it("sets userId and calls next when Supabase returns a valid user", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "supabase-user-99" }), { status: 200 })
    );
    const app = makeApp();
    const res = await app.request(
      makeRequest({ Authorization: "Bearer valid-token" })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string };
    expect(body.userId).toBe("supabase-user-99");
  });

  it("strips the 'Bearer ' prefix before forwarding the token", async () => {
    let capturedAuthHeader = "";
    vi.spyOn(global, "fetch").mockImplementationOnce(
      async (_, init?: RequestInit) => {
        capturedAuthHeader = (init?.headers as Record<string, string>)
          ?.Authorization ?? "";
        return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
      }
    );

    const app = makeApp();
    await app.request(makeRequest({ Authorization: "Bearer my-jwt-token" }));

    // The forwarded header should preserve the raw token
    expect(capturedAuthHeader).toBe("Bearer my-jwt-token");
  });

  it("returns 503 when fetch throws (auth service unavailable)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(
      new Error("Network error")
    );
    const app = makeApp();
    const res = await app.request(
      makeRequest({ Authorization: "Bearer valid-token" })
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Auth service unavailable");
  });
});
