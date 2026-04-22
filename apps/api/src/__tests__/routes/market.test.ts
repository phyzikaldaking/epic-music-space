import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ─────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────

const mockStripeSessionCreate = vi.fn();

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

vi.mock("stripe", () => {
  const Stripe = vi.fn().mockImplementation(function (this: unknown) {
    (this as Record<string, unknown>).checkout = {
      sessions: { create: mockStripeSessionCreate },
    };
  });
  return { default: Stripe };
});

vi.mock("../../middleware/rateLimit", () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
  strictLimiter: {},
  lenientLimiter: {},
}));

// ─────────────────────────────────────────────────────────
// Imports (after mocks)
// ─────────────────────────────────────────────────────────

import { prisma } from "@ems/db";
import { marketRouter } from "../../routes/market";

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function makeApp() {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const userId = c.req.header("x-ems-user-id");
    if (userId) c.set("userId", userId);
    return next();
  });
  app.route("/", marketRouter);
  return app;
}

const mockFindMany  = prisma.song.findMany  as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.song.findUnique as ReturnType<typeof vi.fn>;
const mockLicenseFind = prisma.licenseToken.findFirst as ReturnType<typeof vi.fn>;
const mockTxCreate  = prisma.transaction.create as ReturnType<typeof vi.fn>;

// Representative song stubs
function makeSong(overrides: Record<string, unknown> = {}) {
  return {
    id: "song-1",
    title: "Track One",
    artist: "Artist A",
    genre: "Hip-Hop",
    coverUrl: null,
    licensePrice: 10,
    revenueSharePct: 5,
    totalLicenses: 100,
    soldLicenses: 20,
    aiScore: 60,
    district: "DOWNTOWN_PRIME",
    versusWins: 3,
    createdAt: new Date(),
    isActive: true,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────
// GET /listings
// ─────────────────────────────────────────────────────────

describe("GET /listings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with an array of available listings", async () => {
    const songs = [makeSong(), makeSong({ id: "song-2", soldLicenses: 0 })];
    mockFindMany.mockResolvedValue(songs);

    const app = makeApp();
    const res = await app.request(new Request("http://localhost/listings"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(2);
  });

  it("filters out songs where soldLicenses >= totalLicenses", async () => {
    const songs = [
      makeSong({ soldLicenses: 100, totalLicenses: 100 }), // sold out
      makeSong({ id: "song-2", soldLicenses: 50, totalLicenses: 100 }), // available
    ];
    mockFindMany.mockResolvedValue(songs);

    const app = makeApp();
    const res = await app.request(new Request("http://localhost/listings"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].id).toBe("song-2");
  });

  it("adds availableLicenses field to each listing", async () => {
    mockFindMany.mockResolvedValue([makeSong({ soldLicenses: 30, totalLicenses: 100 })]);

    const app = makeApp();
    const res = await app.request(new Request("http://localhost/listings"));
    const json = await res.json();
    expect(json[0].availableLicenses).toBe(70);
  });

  it("converts Decimal licensePrice to Number", async () => {
    // Prisma Decimal values arrive as objects or strings; the route casts with Number()
    mockFindMany.mockResolvedValue([makeSong({ licensePrice: "19.99" })]);

    const app = makeApp();
    const res = await app.request(new Request("http://localhost/listings"));
    const json = await res.json();
    expect(typeof json[0].licensePrice).toBe("number");
    expect(json[0].licensePrice).toBeCloseTo(19.99);
  });

  it("returns an empty array when no songs are available", async () => {
    mockFindMany.mockResolvedValue([]);

    const app = makeApp();
    const res = await app.request(new Request("http://localhost/listings"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────
// POST /buy
// ─────────────────────────────────────────────────────────

describe("POST /buy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  function buyRequest(body: unknown, userId = "buyer-1") {
    return new Request("http://localhost/buy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": userId,
      },
      body: JSON.stringify(body),
    });
  }

  it("returns 500 when Stripe key is missing and song exists", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    mockFindUnique.mockResolvedValue(makeSong());
    mockLicenseFind.mockResolvedValue(null);

    const app = makeApp();
    const res = await app.request(buyRequest({ songId: "song-1" }));
    // STRIPE_SECRET_KEY missing → getStripe() throws → 500
    expect(res.status).toBe(500);
  });

  it("returns 400 for invalid JSON body", async () => {
    const app = makeApp();
    const res = await app.request(
      new Request("http://localhost/buy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ems-user-id": "buyer-1",
        },
        body: "not-json",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when songId is missing", async () => {
    const app = makeApp();
    const res = await app.request(buyRequest({ quantity: 1 }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when song does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const app = makeApp();
    const res = await app.request(buyRequest({ songId: "ghost-song" }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Song not found");
  });

  it("returns 404 when song is inactive", async () => {
    mockFindUnique.mockResolvedValue(makeSong({ isActive: false }));
    const app = makeApp();
    const res = await app.request(buyRequest({ songId: "song-1" }));
    expect(res.status).toBe(404);
  });

  it("returns 409 when song is sold out", async () => {
    mockFindUnique.mockResolvedValue(
      makeSong({ soldLicenses: 100, totalLicenses: 100 })
    );
    const app = makeApp();
    const res = await app.request(buyRequest({ songId: "song-1" }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/sold out/i);
  });

  it("returns 409 when requested quantity exceeds available licenses", async () => {
    mockFindUnique.mockResolvedValue(makeSong({ soldLicenses: 95, totalLicenses: 100 }));
    const app = makeApp();
    const res = await app.request(buyRequest({ songId: "song-1", quantity: 10 }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/5 license/i);
  });

  it("returns 409 when the user already owns a license for the song", async () => {
    mockFindUnique.mockResolvedValue(makeSong());
    mockLicenseFind.mockResolvedValue({ id: "license-existing" });
    const app = makeApp();
    const res = await app.request(buyRequest({ songId: "song-1", quantity: 1 }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/already hold/i);
  });

  it("creates a Stripe checkout session and returns checkoutUrl on success", async () => {
    mockFindUnique.mockResolvedValue(makeSong());
    mockLicenseFind.mockResolvedValue(null); // no existing license
    mockStripeSessionCreate.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/test",
    });
    mockTxCreate.mockResolvedValue({});

    const app = makeApp();
    const res = await app.request(buyRequest({ songId: "song-1", quantity: 1 }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.checkoutUrl).toBe("https://checkout.stripe.com/test");
  });

  it("records a pending PENDING transaction after creating checkout session", async () => {
    mockFindUnique.mockResolvedValue(makeSong({ licensePrice: 25 }));
    mockLicenseFind.mockResolvedValue(null);
    mockStripeSessionCreate.mockResolvedValue({ id: "cs_456", url: "https://stripe.com" });
    mockTxCreate.mockResolvedValue({});

    const app = makeApp();
    await app.request(buyRequest({ songId: "song-1", quantity: 2 }));

    expect(mockTxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "LICENSE_PURCHASE",
          status: "PENDING",
          amount: 50,
        }),
      })
    );
  });

  it("skips duplicate-ownership check when quantity > 1", async () => {
    mockFindUnique.mockResolvedValue(makeSong());
    // licenseToken.findFirst should NOT be called for quantity > 1
    mockStripeSessionCreate.mockResolvedValue({ id: "cs_789", url: "https://stripe.com" });
    mockTxCreate.mockResolvedValue({});

    const app = makeApp();
    await app.request(buyRequest({ songId: "song-1", quantity: 2 }));

    expect(mockLicenseFind).not.toHaveBeenCalled();
  });
});
