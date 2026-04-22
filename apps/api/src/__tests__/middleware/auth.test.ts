import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth";

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function makeApp() {
  const app = new Hono();
  app.use("*", authMiddleware);
  app.get("/protected", (c) => c.json({ userId: c.get("userId") }));
  return app;
}

function get(path: string, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, { headers });
}

// ─────────────────────────────────────────────────────────
// Development bypass (no Supabase env vars set)
// ─────────────────────────────────────────────────────────

describe("authMiddleware — dev bypass (no Supabase env)", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when x-ems-user-id header is absent", async () => {
    const app = makeApp();
    const res = await app.request(get("/protected"));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("sets userId and proceeds when x-ems-user-id is provided", async () => {
    const app = makeApp();
    const res = await app.request(get("/protected", { "x-ems-user-id": "dev-user-42" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.userId).toBe("dev-user-42");
  });
});

// ─────────────────────────────────────────────────────────
// Production mode without Supabase — should error
// ─────────────────────────────────────────────────────────

describe("authMiddleware — production with missing Supabase config", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    vi.restoreAllMocks();
  });

  it("returns 500 in production when Supabase env is not configured", async () => {
    const app = makeApp();
    const res = await app.request(get("/protected", { "x-ems-user-id": "any-user" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Auth not configured");
  });
});

// ─────────────────────────────────────────────────────────
// Supabase JWT path
// ─────────────────────────────────────────────────────────

describe("authMiddleware — Supabase JWT verification", () => {
  const SUPABASE_URL = "https://mock.supabase.co";
  const SUPABASE_KEY = "mock-anon-key";

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = SUPABASE_KEY;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    vi.restoreAllMocks();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const app = makeApp();
    const res = await app.request(get("/protected"));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 401 when Bearer token is empty", async () => {
    const app = makeApp();
    const res = await app.request(get("/protected", { authorization: "Bearer " }));
    // After stripping "Bearer " there's an empty string — Supabase fetch will fail
    // We mock fetch to respond with a non-ok status
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("{}", { status: 401 })
    );
    const res2 = await app.request(get("/protected", { authorization: "Bearer fake-token" }));
    expect(res2.status).toBe(401);
  });

  it("returns 401 when Supabase responds with a non-ok status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Invalid JWT" }), { status: 401 })
    );
    const app = makeApp();
    const res = await app.request(
      get("/protected", { authorization: "Bearer bad-token" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when Supabase response has no user id", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: null }), { status: 200 })
    );
    const app = makeApp();
    const res = await app.request(
      get("/protected", { authorization: "Bearer token-without-id" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when fetch throws a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
    const app = makeApp();
    const res = await app.request(
      get("/protected", { authorization: "Bearer token" })
    );
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("Auth service unavailable");
  });

  it("sets userId and proceeds on a successful Supabase response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "supabase-user-99" }), { status: 200 })
    );
    const app = makeApp();
    const res = await app.request(
      get("/protected", { authorization: "Bearer valid-token" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.userId).toBe("supabase-user-99");
  });

  it("passes the correct headers to Supabase /auth/v1/user", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "user-x" }), { status: 200 })
    );
    const app = makeApp();
    await app.request(get("/protected", { authorization: "Bearer my-jwt" }));

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(`${SUPABASE_URL}/auth/v1/user`);
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer my-jwt",
      apikey: SUPABASE_KEY,
    });
  });

  it("strips 'Bearer ' prefix (case-insensitive) from the token", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "user-y" }), { status: 200 })
    );
    const app = makeApp();
    await app.request(get("/protected", { authorization: "BEARER my-caps-token" }));

    const [, init] = spy.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer my-caps-token",
    });
  });
});
