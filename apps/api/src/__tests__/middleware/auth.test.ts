import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth";

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function buildApp() {
  const app = new Hono();
  app.use("*", authMiddleware);
  app.get("/protected", (c) => c.json({ userId: c.get("userId") }));
  return app;
}

async function request(
  app: Hono,
  headers: Record<string, string> = {}
) {
  return app.request("/protected", { headers });
}

// ─────────────────────────────────────────────────────────
// Auth middleware — development bypass (no Supabase vars)
// ─────────────────────────────────────────────────────────

describe("authMiddleware — dev bypass (no SUPABASE env vars)", () => {
  beforeEach(() => {
    // Ensure Supabase env vars are absent
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when no x-ems-user-id header is provided", async () => {
    const app = buildApp();
    const res = await request(app);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Unauthorized" });
  });

  it("sets userId from x-ems-user-id in dev bypass mode", async () => {
    const app = buildApp();
    const res = await request(app, { "x-ems-user-id": "user-abc" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ userId: "user-abc" });
  });
});

// ─────────────────────────────────────────────────────────
// Auth middleware — Supabase path
// ─────────────────────────────────────────────────────────

describe("authMiddleware — Supabase JWT path", () => {
  const SUPABASE_URL = "https://supabase.example.com";
  const SUPABASE_ANON = "anon-key-123";

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = SUPABASE_ANON;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("returns 401 when Authorization header is missing", async () => {
    const app = buildApp();
    const res = await request(app);
    expect(res.status).toBe(401);
  });

  it("returns 401 when Supabase responds with a non-ok status", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_token" }), { status: 401 })
    );
    const app = buildApp();
    const res = await request(app, { Authorization: "Bearer bad-token" });
    expect(res.status).toBe(401);
  });

  it("sets userId when Supabase returns a valid user", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "supabase-user-1" }), { status: 200 })
    );
    const app = buildApp();
    const res = await request(app, { Authorization: "Bearer valid-token" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ userId: "supabase-user-1" });
  });

  it("returns 401 when Supabase response has no id field", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );
    const app = buildApp();
    const res = await request(app, { Authorization: "Bearer token-no-id" });
    expect(res.status).toBe(401);
  });

  it("returns 503 when fetch throws (Supabase unavailable)", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));
    const app = buildApp();
    const res = await request(app, { Authorization: "Bearer any-token" });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Auth service unavailable" });
  });

  it("returns 500 in production when Supabase env vars are missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const app = buildApp();
    const res = await request(app, { "x-ems-user-id": "user-abc" });
    expect(res.status).toBe(500);

    process.env.NODE_ENV = originalNodeEnv;
  });
});
