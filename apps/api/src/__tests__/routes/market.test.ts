import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ── Mock @ems/db before importing routes ──────────────────────────────────────
vi.mock("@ems/db", () => ({
  prisma: {
    song: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    licenseToken: {
      findFirst: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
    },
  },
}));

// ── Mock stripe ────────────────────────────────────────────────────────────────
vi.mock("stripe", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      checkout: {
        sessions: {
          create: vi.fn(),
        },
      },
    })),
  };
});

// ── Mock rate limiting (bypass in tests) ──────────────────────────────────────
vi.mock("../../middleware/rateLimit", () => ({
  rateLimit: () => (_c: unknown, next: () => Promise<void>) => next(),
  strictLimiter: {},
  lenientLimiter: {},
}));

import { prisma } from "@ems/db";
import Stripe from "stripe";
import { marketRouter } from "../../routes/market";

// Build a minimal test app that mounts the market router
function buildApp() {
  const app = new Hono();
  // Inject a userId as if authMiddleware passed
  app.use("*", async (c, next) => {
    c.set("userId", "test-user-id");
    await next();
  });
  app.route("/api/market", marketRouter);
  return app;
}

// Helper to access the mocked Stripe instance's sessions.create
function getStripeSessionCreate() {
  const StripeMock = vi.mocked(Stripe);
  const instance = StripeMock.mock.results[0]?.value as {
    checkout: { sessions: { create: ReturnType<typeof vi.fn> } };
  };
  return instance?.checkout?.sessions?.create;
}

describe("GET /api/market/listings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No Stripe env needed for listings
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("returns filtered listings with availableLicenses", async () => {
    const mockSongs = [
      {
        id: "song-1",
        title: "Track One",
        artist: "Artist A",
        genre: "Hip Hop",
        coverUrl: null,
        licensePrice: "9.99",
        revenueSharePct: "10.00",
        totalLicenses: 100,
        soldLicenses: 40,
        aiScore: 75,
        district: "DOWNTOWN_PRIME",
        versusWins: 5,
        createdAt: new Date("2024-01-01"),
      },
      {
        id: "song-2",
        title: "Sold Out Track",
        artist: "Artist B",
        genre: "Pop",
        coverUrl: null,
        licensePrice: "4.99",
        revenueSharePct: "5.00",
        totalLicenses: 50,
        soldLicenses: 50, // fully sold out — should be filtered out
        aiScore: 60,
        district: "INDIE_BLOCKS",
        versusWins: 2,
        createdAt: new Date("2024-01-02"),
      },
    ];
    vi.mocked(prisma.song.findMany).mockResolvedValue(mockSongs as never);

    const app = buildApp();
    const res = await app.request("/api/market/listings");
    expect(res.status).toBe(200);

    const body = (await res.json()) as Array<Record<string, unknown>>;
    // Only song-1 should appear (song-2 is sold out)
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: "song-1",
      availableLicenses: 60,
      licensePrice: 9.99,
      revenueSharePct: 10,
    });
  });

  it("returns empty array when all songs are sold out", async () => {
    vi.mocked(prisma.song.findMany).mockResolvedValue([
      {
        id: "s",
        title: "T",
        artist: "A",
        genre: null,
        coverUrl: null,
        licensePrice: "5.00",
        revenueSharePct: "5.00",
        totalLicenses: 10,
        soldLicenses: 10,
        aiScore: 50,
        district: "INDIE_BLOCKS",
        versusWins: 0,
        createdAt: new Date(),
      },
    ] as never);

    const app = buildApp();
    const res = await app.request("/api/market/listings");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns empty array when no active songs exist", async () => {
    vi.mocked(prisma.song.findMany).mockResolvedValue([]);

    const app = buildApp();
    const res = await app.request("/api/market/listings");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("limits results to 100 entries", async () => {
    const songs = Array.from({ length: 150 }, (_, i) => ({
      id: `song-${i}`,
      title: `Track ${i}`,
      artist: "Artist",
      genre: null,
      coverUrl: null,
      licensePrice: "5.00",
      revenueSharePct: "5.00",
      totalLicenses: 100,
      soldLicenses: 0,
      aiScore: 50,
      district: "INDIE_BLOCKS",
      versusWins: 0,
      createdAt: new Date(),
    }));
    vi.mocked(prisma.song.findMany).mockResolvedValue(songs as never);

    const app = buildApp();
    const res = await app.request("/api/market/listings");
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(100);
  });
});

describe("POST /api/market/buy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    // Bypass auth
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  function buildBuyApp() {
    const app = new Hono();
    // Simulate auth middleware setting userId
    app.use("*", async (c, next) => {
      const userId = c.req.header("x-ems-user-id");
      if (!userId) return c.json({ error: "Unauthorized" }, 401);
      c.set("userId", userId);
      await next();
    });
    app.route("/api/market", marketRouter);
    return app;
  }

  it("returns 400 for invalid JSON body", async () => {
    const app = buildBuyApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "user-1",
      },
      body: "not-json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Invalid JSON body" });
  });

  it("returns 400 when songId is missing", async () => {
    const app = buildBuyApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "user-1",
      },
      body: JSON.stringify({ quantity: 1 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when quantity is out of range", async () => {
    const app = buildBuyApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "user-1",
      },
      body: JSON.stringify({ songId: "song-1", quantity: 200 }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when song does not exist", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue(null);

    const app = buildBuyApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "user-1",
      },
      body: JSON.stringify({ songId: "nonexistent-song" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Song not found" });
  });

  it("returns 404 when song is not active", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({
      id: "song-1",
      isActive: false,
      totalLicenses: 100,
      soldLicenses: 0,
      licensePrice: "9.99",
      title: "Track",
      artist: "Artist",
      revenueSharePct: "10",
      coverUrl: null,
    } as never);

    const app = buildBuyApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "user-1",
      },
      body: JSON.stringify({ songId: "song-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when song is sold out", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({
      id: "song-1",
      isActive: true,
      totalLicenses: 100,
      soldLicenses: 100,
      licensePrice: "9.99",
      title: "Track",
      artist: "Artist",
      revenueSharePct: "10",
      coverUrl: null,
    } as never);

    const app = buildBuyApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "user-1",
      },
      body: JSON.stringify({ songId: "song-1" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ error: "This song is sold out" });
  });

  it("returns 409 when requested quantity exceeds available licenses", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({
      id: "song-1",
      isActive: true,
      totalLicenses: 10,
      soldLicenses: 8,
      licensePrice: "9.99",
      title: "Track",
      artist: "Artist",
      revenueSharePct: "10",
      coverUrl: null,
    } as never);

    const app = buildBuyApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "user-1",
      },
      body: JSON.stringify({ songId: "song-1", quantity: 5 }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect((body as { error: string }).error).toContain("Only 2 license(s) available");
  });

  it("returns 409 when user already holds a license for that song", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({
      id: "song-1",
      isActive: true,
      totalLicenses: 100,
      soldLicenses: 1,
      licensePrice: "9.99",
      title: "Track",
      artist: "Artist",
      revenueSharePct: "10",
      coverUrl: null,
    } as never);
    vi.mocked(prisma.licenseToken.findFirst).mockResolvedValue({
      id: "token-1",
      songId: "song-1",
      holderId: "user-1",
      status: "ACTIVE",
    } as never);

    const app = buildBuyApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "user-1",
      },
      body: JSON.stringify({ songId: "song-1", quantity: 1 }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({
      error: "You already hold a license for this song",
    });
  });

  it("returns 201 with checkoutUrl on successful purchase", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({
      id: "song-1",
      isActive: true,
      totalLicenses: 100,
      soldLicenses: 0,
      licensePrice: "9.99",
      title: "Banger Track",
      artist: "Cool Artist",
      revenueSharePct: "10",
      coverUrl: "https://cdn.example.com/cover.jpg",
    } as never);
    vi.mocked(prisma.licenseToken.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.transaction.create).mockResolvedValue({} as never);

    // Re-create Stripe mock and attach sessions.create return value
    const StripeMock = vi.mocked(Stripe);
    // Clear instances to get fresh one on next construction
    StripeMock.mockImplementation(
      () =>
        ({
          checkout: {
            sessions: {
              create: vi.fn().mockResolvedValue({
                id: "cs_test_123",
                url: "https://checkout.stripe.com/pay/cs_test_123",
              }),
            },
          },
        }) as never
    );

    const app = buildBuyApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "user-1",
      },
      body: JSON.stringify({ songId: "song-1", quantity: 1 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("checkoutUrl");
    expect(typeof (body as { checkoutUrl: string }).checkoutUrl).toBe("string");
  });

  it("skips duplicate license check when buying more than 1 license", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({
      id: "song-1",
      isActive: true,
      totalLicenses: 100,
      soldLicenses: 0,
      licensePrice: "9.99",
      title: "Track",
      artist: "Artist",
      revenueSharePct: "10",
      coverUrl: null,
    } as never);
    vi.mocked(prisma.transaction.create).mockResolvedValue({} as never);

    const StripeMock = vi.mocked(Stripe);
    StripeMock.mockImplementation(
      () =>
        ({
          checkout: {
            sessions: {
              create: vi.fn().mockResolvedValue({
                id: "cs_multi",
                url: "https://checkout.stripe.com/pay/cs_multi",
              }),
            },
          },
        }) as never
    );

    const app = buildBuyApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "user-1",
      },
      body: JSON.stringify({ songId: "song-1", quantity: 3 }),
    });

    // findFirst should NOT have been called for quantity > 1
    expect(prisma.licenseToken.findFirst).not.toHaveBeenCalled();
    expect(res.status).toBe(201);
  });
});
