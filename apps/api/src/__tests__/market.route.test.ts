/**
 * Integration tests for the market routes:
 *   GET  /api/market/listings
 *   POST /api/market/buy
 *
 * Prisma, Stripe, and rate limiting are mocked.
 * Authentication uses the dev-bypass path (x-ems-user-id header).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock("../middleware/rateLimit", () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
  strictLimiter: {},
  lenientLimiter: {},
}));

const prismaMock = vi.hoisted(() => ({
  song: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  licenseToken: { findFirst: vi.fn() },
  transaction: { create: vi.fn() },
}));

vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

// Mock stripe so tests don't need a real API key
const mockCheckoutCreate = vi.hoisted(() => vi.fn());
vi.mock("stripe", () => {
  // Must use a regular function (not an arrow function) to work as a constructor
  function MockStripe() {
    return {
      checkout: {
        sessions: { create: mockCheckoutCreate },
      },
    };
  }
  return { default: MockStripe };
});

import { marketRouter } from "../routes/market";

// ── Test app ──────────────────────────────────────────────────────────────

function buildApp() {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.route("/api/market", marketRouter);
  return app;
}

const AUTH_HEADERS = {
  "Content-Type": "application/json",
  "x-ems-user-id": "buyer-user-id",
};

// ── Song fixture ──────────────────────────────────────────────────────────

function makeSong(overrides: Record<string, unknown> = {}) {
  return {
    id: "song-1",
    title: "Hit Track",
    artist: "DJ Test",
    genre: "Electronic",
    coverUrl: null,
    licensePrice: 9.99,
    revenueSharePct: 5,
    totalLicenses: 100,
    soldLicenses: 0,
    aiScore: 75,
    district: "DOWNTOWN_PRIME",
    versusWins: 3,
    createdAt: new Date(),
    isActive: true,
    ...overrides,
  };
}

// ── GET /api/market/listings ───────────────────────────────────────────────

describe("GET /api/market/listings", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    vi.clearAllMocks();
  });

  it("returns an empty array when there are no active listings", async () => {
    prismaMock.song.findMany.mockResolvedValue([]);
    const app = buildApp();
    const res = await app.request("/api/market/listings");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns available listings with numeric licensePrice and revenueSharePct", async () => {
    prismaMock.song.findMany.mockResolvedValue([makeSong()]);
    const app = buildApp();
    const res = await app.request("/api/market/listings");
    expect(res.status).toBe(200);
    const [listing] = await res.json() as Array<Record<string, unknown>>;
    expect(typeof listing.licensePrice).toBe("number");
    expect(typeof listing.revenueSharePct).toBe("number");
  });

  it("includes availableLicenses in each listing", async () => {
    const song = makeSong({ totalLicenses: 100, soldLicenses: 30 });
    prismaMock.song.findMany.mockResolvedValue([song]);
    const app = buildApp();
    const res = await app.request("/api/market/listings");
    const [listing] = await res.json() as Array<{ availableLicenses: number }>;
    expect(listing.availableLicenses).toBe(70);
  });

  it("filters out sold-out songs (soldLicenses >= totalLicenses)", async () => {
    const available = makeSong({ id: "song-available", totalLicenses: 10, soldLicenses: 5 });
    const soldOut = makeSong({ id: "song-soldout", totalLicenses: 10, soldLicenses: 10 });
    prismaMock.song.findMany.mockResolvedValue([available, soldOut]);
    const app = buildApp();
    const res = await app.request("/api/market/listings");
    const body = await res.json() as Array<{ id: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("song-available");
  });

  it("limits the response to at most 100 listings", async () => {
    const songs = Array.from({ length: 150 }, (_, i) =>
      makeSong({ id: `song-${i}` })
    );
    prismaMock.song.findMany.mockResolvedValue(songs);
    const app = buildApp();
    const res = await app.request("/api/market/listings");
    const body = await res.json() as unknown[];
    expect(body.length).toBeLessThanOrEqual(100);
  });

  it("does not require authentication", async () => {
    prismaMock.song.findMany.mockResolvedValue([]);
    const app = buildApp();
    // No auth headers — should still succeed
    const res = await app.request("/api/market/listings");
    expect(res.status).toBe(200);
  });
});

// ── POST /api/market/buy ───────────────────────────────────────────────────

describe("POST /api/market/buy", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    const app = buildApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId: "song-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const app = buildApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: "not-json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when songId is missing", async () => {
    const app = buildApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ quantity: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when song is not found", async () => {
    prismaMock.song.findUnique.mockResolvedValue(null);
    const app = buildApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ songId: "nonexistent" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/song not found/i);
  });

  it("returns 404 when song is inactive", async () => {
    prismaMock.song.findUnique.mockResolvedValue(makeSong({ isActive: false }));
    const app = buildApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ songId: "song-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when the song is sold out", async () => {
    prismaMock.song.findUnique.mockResolvedValue(
      makeSong({ totalLicenses: 10, soldLicenses: 10 })
    );
    const app = buildApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ songId: "song-1" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/sold out/i);
  });

  it("returns 409 when quantity exceeds available licenses", async () => {
    prismaMock.song.findUnique.mockResolvedValue(
      makeSong({ totalLicenses: 5, soldLicenses: 4 })
    );
    const app = buildApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ songId: "song-1", quantity: 3 }),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/only 1 license/i);
  });

  it("returns 409 when the user already holds a license for this song", async () => {
    prismaMock.song.findUnique.mockResolvedValue(makeSong());
    prismaMock.licenseToken.findFirst.mockResolvedValue({ id: "existing-token" });
    const app = buildApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ songId: "song-1", quantity: 1 }),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/already hold a license/i);
  });

  it("skips the duplicate-ownership check when quantity > 1", async () => {
    prismaMock.song.findUnique.mockResolvedValue(makeSong({ totalLicenses: 100, soldLicenses: 0 }));
    mockCheckoutCreate.mockResolvedValue({ id: "cs_test", url: "https://stripe.com/pay/cs_test" });
    prismaMock.transaction.create.mockResolvedValue({});

    const app = buildApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ songId: "song-1", quantity: 2 }),
    });

    // findFirst should NOT have been called for duplicate check
    expect(prismaMock.licenseToken.findFirst).not.toHaveBeenCalled();
    expect(res.status).toBe(201);
  });

  it("returns 201 with a checkoutUrl on a successful purchase", async () => {
    prismaMock.song.findUnique.mockResolvedValue(makeSong());
    prismaMock.licenseToken.findFirst.mockResolvedValue(null);
    mockCheckoutCreate.mockResolvedValue({
      id: "cs_test_abc",
      url: "https://stripe.com/pay/cs_test_abc",
    });
    prismaMock.transaction.create.mockResolvedValue({});

    const app = buildApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ songId: "song-1", quantity: 1 }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { checkoutUrl: string };
    expect(body.checkoutUrl).toBe("https://stripe.com/pay/cs_test_abc");
  });

  it("records a PENDING transaction after creating the Stripe session", async () => {
    prismaMock.song.findUnique.mockResolvedValue(makeSong());
    prismaMock.licenseToken.findFirst.mockResolvedValue(null);
    mockCheckoutCreate.mockResolvedValue({ id: "cs_session", url: "https://stripe.com/pay/cs_session" });
    prismaMock.transaction.create.mockResolvedValue({});

    const app = buildApp();
    await app.request("/api/market/buy", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ songId: "song-1", quantity: 1 }),
    });

    expect(prismaMock.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          type: "LICENSE_PURCHASE",
          stripeSessionId: "cs_session",
        }),
      })
    );
  });
});
