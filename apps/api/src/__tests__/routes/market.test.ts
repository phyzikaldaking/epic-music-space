import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ─────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────

// Mock @ems/db (prisma)
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

// Mock stripe
vi.mock("stripe", () => {
  const mockCreate = vi.fn();
  const StripeMock = vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockCreate } },
  }));
  (StripeMock as unknown as { _mockCreate: typeof mockCreate })._mockCreate = mockCreate;
  return { default: StripeMock };
});

// Mock rate-limiter-flexible so limits are never hit in tests
vi.mock("rate-limiter-flexible", () => ({
  RateLimiterMemory: vi.fn().mockImplementation(() => ({ consume: vi.fn() })),
  RateLimiterRedis: vi.fn().mockImplementation(() => ({ consume: vi.fn() })),
}));

// Mock ioredis so no real Redis connection is attempted
vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    status: "ready",
  })),
}));

// ─────────────────────────────────────────────────────────
// Lazy imports (after mocks are registered)
// ─────────────────────────────────────────────────────────

async function getApp() {
  const { marketRouter } = await import("../../routes/market");
  const app = new Hono();
  // Use dev-bypass auth (no supabase env vars)
  const { authMiddleware } = await import("../../middleware/auth");
  app.use("*", (c, next) => {
    // Inject a fixed userId so auth always passes
    c.set("userId", "test-user-1");
    return next();
  });
  app.route("/api/market", marketRouter);
  return app;
}

// ─────────────────────────────────────────────────────────
// GET /api/market/listings
// ─────────────────────────────────────────────────────────

describe("GET /api/market/listings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("returns an empty array when no active songs exist", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.song.findMany).mockResolvedValue([]);

    const app = await getApp();
    const res = await app.request("/api/market/listings");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns only songs with available licenses", async () => {
    const { prisma } = await import("@ems/db");
    const songs = [
      {
        id: "song-1",
        title: "Track A",
        artist: "Artist X",
        genre: "Hip-Hop",
        coverUrl: null,
        licensePrice: "10.00",
        revenueSharePct: "5.00",
        totalLicenses: 100,
        soldLicenses: 50,
        aiScore: 80,
        district: "DOWNTOWN_PRIME",
        versusWins: 3,
        createdAt: new Date("2024-01-01"),
      },
      {
        id: "song-2",
        title: "Track B",
        artist: "Artist Y",
        genre: "Pop",
        coverUrl: null,
        licensePrice: "20.00",
        revenueSharePct: "10.00",
        totalLicenses: 100,
        soldLicenses: 100, // sold out
        aiScore: 90,
        district: "LABEL_ROW",
        versusWins: 10,
        createdAt: new Date("2024-01-02"),
      },
    ] as never[];
    vi.mocked(prisma.song.findMany).mockResolvedValue(songs);

    const app = await getApp();
    const res = await app.request("/api/market/listings");
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ id: string; availableLicenses: number }>;
    // Sold-out track B should be filtered out
    expect(body).toHaveLength(1);
    expect(body[0]!.id).toBe("song-1");
    expect(body[0]!.availableLicenses).toBe(50);
  });

  it("converts licensePrice and revenueSharePct to numbers", async () => {
    const { prisma } = await import("@ems/db");
    const songs = [
      {
        id: "song-1",
        title: "Track A",
        artist: "Artist X",
        genre: "Hip-Hop",
        coverUrl: null,
        licensePrice: "12.50",
        revenueSharePct: "7.50",
        totalLicenses: 100,
        soldLicenses: 10,
        aiScore: 60,
        district: "DOWNTOWN_PRIME",
        versusWins: 1,
        createdAt: new Date("2024-01-01"),
      },
    ] as never[];
    vi.mocked(prisma.song.findMany).mockResolvedValue(songs);

    const app = await getApp();
    const res = await app.request("/api/market/listings");
    const body = await res.json() as Array<{ licensePrice: unknown; revenueSharePct: unknown }>;
    expect(typeof body[0]!.licensePrice).toBe("number");
    expect(typeof body[0]!.revenueSharePct).toBe("number");
    expect(body[0]!.licensePrice).toBe(12.5);
    expect(body[0]!.revenueSharePct).toBe(7.5);
  });
});

// ─────────────────────────────────────────────────────────
// POST /api/market/buy
// ─────────────────────────────────────────────────────────

describe("POST /api/market/buy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  });

  async function postBuy(body: unknown, app?: Hono) {
    const a = app ?? (await getApp());
    return a.request("/api/market/buy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "test-user-1",
      },
      body: JSON.stringify(body),
    });
  }

  it("returns 400 for invalid JSON body", async () => {
    const app = await getApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ems-user-id": "test-user-1" },
      body: "not-json{{",
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid json/i);
  });

  it("returns 400 when songId is missing", async () => {
    const res = await postBuy({ quantity: 1 });
    expect(res.status).toBe(400);
  });

  it("returns 404 when song does not exist", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.song.findUnique).mockResolvedValue(null);

    const res = await postBuy({ songId: "missing-id" });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 404 when song exists but is not active", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.song.findUnique).mockResolvedValue({
      id: "song-1",
      isActive: false,
      totalLicenses: 100,
      soldLicenses: 0,
      licensePrice: "10.00",
      revenueSharePct: "5.00",
      title: "Track A",
      artist: "Artist X",
      coverUrl: null,
    } as never);

    const res = await postBuy({ songId: "song-1" });
    expect(res.status).toBe(404);
  });

  it("returns 409 when song is sold out", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.song.findUnique).mockResolvedValue({
      id: "song-1",
      isActive: true,
      totalLicenses: 100,
      soldLicenses: 100,
      licensePrice: "10.00",
      revenueSharePct: "5.00",
      title: "Track A",
      artist: "Artist X",
      coverUrl: null,
    } as never);

    const res = await postBuy({ songId: "song-1" });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/sold out/i);
  });

  it("returns 409 when requested quantity exceeds availability", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.song.findUnique).mockResolvedValue({
      id: "song-1",
      isActive: true,
      totalLicenses: 100,
      soldLicenses: 98,
      licensePrice: "10.00",
      revenueSharePct: "5.00",
      title: "Track A",
      artist: "Artist X",
      coverUrl: null,
    } as never);

    const res = await postBuy({ songId: "song-1", quantity: 5 });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/2 license/i);
  });

  it("returns 409 when user already holds a license for the song", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.song.findUnique).mockResolvedValue({
      id: "song-1",
      isActive: true,
      totalLicenses: 100,
      soldLicenses: 5,
      licensePrice: "10.00",
      revenueSharePct: "5.00",
      title: "Track A",
      artist: "Artist X",
      coverUrl: null,
    } as never);
    vi.mocked(prisma.licenseToken.findFirst).mockResolvedValue({
      id: "token-1",
      songId: "song-1",
      holderId: "test-user-1",
      status: "ACTIVE",
    } as never);

    const res = await postBuy({ songId: "song-1", quantity: 1 });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/already hold/i);
  });

  it("creates a Stripe checkout session and returns checkoutUrl", async () => {
    const { prisma } = await import("@ems/db");
    const Stripe = (await import("stripe")).default;

    vi.mocked(prisma.song.findUnique).mockResolvedValue({
      id: "song-1",
      isActive: true,
      totalLicenses: 100,
      soldLicenses: 5,
      licensePrice: "10.00",
      revenueSharePct: "5.00",
      title: "Track A",
      artist: "Artist X",
      coverUrl: "https://example.com/cover.jpg",
    } as never);
    vi.mocked(prisma.licenseToken.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.transaction.create).mockResolvedValue({} as never);

    // Get the mock instance that will be created by new Stripe(...)
    const mockSessionCreate = vi.fn().mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/pay/cs_test_123",
    });
    vi.mocked(Stripe).mockImplementation(() => ({
      checkout: { sessions: { create: mockSessionCreate } },
    }) as never);

    const res = await postBuy({ songId: "song-1", quantity: 1 });
    expect(res.status).toBe(201);
    const body = await res.json() as { checkoutUrl: string };
    expect(body.checkoutUrl).toBe("https://checkout.stripe.com/pay/cs_test_123");
  });
});
