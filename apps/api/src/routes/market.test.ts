import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

// ─────────────────────────────────────────────────────────
// Module mocks — must be declared before any dynamic imports
// ─────────────────────────────────────────────────────────

const mockPrisma = {
  song: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  licenseToken: {
    findFirst: vi.fn(),
  },
  transaction: {
    create: vi.fn(),
  },
};

vi.mock("@ems/db", () => ({ prisma: mockPrisma }));

const mockSessionCreate = vi.fn();
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockSessionCreate,
      },
    },
  })),
}));

vi.mock("../middleware/rateLimit", () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
  strictLimiter: {},
  lenientLimiter: {},
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: async (
    c: { req: { header: (h: string) => string | undefined }; set: (k: string, v: string) => void },
    next: () => Promise<void>
  ) => {
    const userId = c.req.header("x-ems-user-id");
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    c.set("userId", userId);
    return next();
  },
}));

// ─────────────────────────────────────────────────────────
// Import the router under test (after mocks are registered)
// ─────────────────────────────────────────────────────────

const { marketRouter } = await import("../routes/market");

// ─────────────────────────────────────────────────────────
// Test app
// ─────────────────────────────────────────────────────────

function makeApp() {
  const app = new Hono();
  app.route("/api/market", marketRouter);
  return app;
}

// ─────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────

const FAKE_SONG = {
  id: "song-1",
  title: "Test Song",
  artist: "Artist A",
  genre: "Pop",
  coverUrl: "https://example.com/cover.jpg",
  licensePrice: 9.99,
  revenueSharePct: 10,
  totalLicenses: 100,
  soldLicenses: 10,
  aiScore: 75,
  district: "DOWNTOWN_PRIME",
  versusWins: 5,
  isActive: true,
  createdAt: new Date("2024-01-01"),
};

// ─────────────────────────────────────────────────────────
// GET /api/market/listings
// ─────────────────────────────────────────────────────────

describe("GET /api/market/listings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with available listings", async () => {
    mockPrisma.song.findMany.mockResolvedValueOnce([FAKE_SONG]);

    const app = makeApp();
    const res = await app.request("/api/market/listings");
    expect(res.status).toBe(200);

    const body = (await res.json()) as Array<typeof FAKE_SONG & { availableLicenses: number }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0]!.id).toBe("song-1");
    expect(body[0]!.availableLicenses).toBe(90); // 100 - 10
  });

  it("excludes songs that are fully sold out", async () => {
    mockPrisma.song.findMany.mockResolvedValueOnce([
      { ...FAKE_SONG, soldLicenses: 100, totalLicenses: 100 },
    ]);

    const app = makeApp();
    const res = await app.request("/api/market/listings");
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(0);
  });

  it("converts licensePrice and revenueSharePct to numbers", async () => {
    mockPrisma.song.findMany.mockResolvedValueOnce([
      { ...FAKE_SONG, licensePrice: "9.99", revenueSharePct: "10.5" },
    ]);

    const app = makeApp();
    const res = await app.request("/api/market/listings");
    const body = (await res.json()) as Array<{ licensePrice: unknown; revenueSharePct: unknown }>;
    expect(typeof body[0]!.licensePrice).toBe("number");
    expect(typeof body[0]!.revenueSharePct).toBe("number");
  });

  it("returns an empty array when there are no active listings", async () => {
    mockPrisma.song.findMany.mockResolvedValueOnce([]);

    const app = makeApp();
    const res = await app.request("/api/market/listings");
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────
// POST /api/market/buy
// ─────────────────────────────────────────────────────────

describe("POST /api/market/buy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    // Auth bypass: no SUPABASE env vars, using x-ems-user-id header
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  function postBuy(body: unknown, userId = "user-abc") {
    return makeApp().request("/api/market/buy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": userId,
      },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when the request has no auth header", async () => {
    const app = makeApp();
    const res = await app.request("/api/market/buy", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    const app = makeApp();
    const res = await app.request("/api/market/buy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "user-abc",
      },
      body: "not-json{{{",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 400 when songId is missing", async () => {
    const res = await postBuy({ quantity: 1 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when quantity is invalid (zero)", async () => {
    const res = await postBuy({ songId: "song-1", quantity: 0 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when quantity exceeds maximum of 100", async () => {
    const res = await postBuy({ songId: "song-1", quantity: 101 });
    expect(res.status).toBe(400);
  });

  it("returns 404 when song does not exist", async () => {
    mockPrisma.song.findUnique.mockResolvedValueOnce(null);
    const res = await postBuy({ songId: "nonexistent" });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Song not found");
  });

  it("returns 404 when song exists but is inactive", async () => {
    mockPrisma.song.findUnique.mockResolvedValueOnce({
      ...FAKE_SONG,
      isActive: false,
    });
    const res = await postBuy({ songId: "song-1" });
    expect(res.status).toBe(404);
  });

  it("returns 409 when song is sold out", async () => {
    mockPrisma.song.findUnique.mockResolvedValueOnce({
      ...FAKE_SONG,
      soldLicenses: 100,
      totalLicenses: 100,
    });
    const res = await postBuy({ songId: "song-1" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("This song is sold out");
  });

  it("returns 409 when requested quantity exceeds available licenses", async () => {
    mockPrisma.song.findUnique.mockResolvedValueOnce({
      ...FAKE_SONG,
      soldLicenses: 95,
      totalLicenses: 100,
    });
    const res = await postBuy({ songId: "song-1", quantity: 10 });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Only \d+ license/);
  });

  it("returns 409 when user already holds an active license for this song", async () => {
    mockPrisma.song.findUnique.mockResolvedValueOnce(FAKE_SONG);
    mockPrisma.licenseToken.findFirst.mockResolvedValueOnce({
      id: "lt-1",
      songId: "song-1",
      holderId: "user-abc",
      status: "ACTIVE",
    });
    const res = await postBuy({ songId: "song-1", quantity: 1 });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("You already hold a license for this song");
  });

  it("returns 201 with a Stripe checkout URL on success", async () => {
    mockPrisma.song.findUnique.mockResolvedValueOnce(FAKE_SONG);
    mockPrisma.licenseToken.findFirst.mockResolvedValueOnce(null);
    mockSessionCreate.mockResolvedValueOnce({
      id: "cs_test_abc",
      url: "https://checkout.stripe.com/pay/cs_test_abc",
    });
    mockPrisma.transaction.create.mockResolvedValueOnce({});

    const res = await postBuy({ songId: "song-1", quantity: 1 });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { checkoutUrl: string };
    expect(body.checkoutUrl).toBe("https://checkout.stripe.com/pay/cs_test_abc");
  });

  it("skips duplicate-ownership check when quantity > 1", async () => {
    mockPrisma.song.findUnique.mockResolvedValueOnce({
      ...FAKE_SONG,
      soldLicenses: 0,
      totalLicenses: 100,
    });
    // licenseToken.findFirst should NOT be called for quantity > 1
    mockSessionCreate.mockResolvedValueOnce({
      id: "cs_test_multi",
      url: "https://checkout.stripe.com/pay/cs_test_multi",
    });
    mockPrisma.transaction.create.mockResolvedValueOnce({});

    const res = await postBuy({ songId: "song-1", quantity: 2 });
    expect(res.status).toBe(201);
    expect(mockPrisma.licenseToken.findFirst).not.toHaveBeenCalled();
  });
});
