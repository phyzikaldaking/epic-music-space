import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { z } from "zod";

vi.mock("../middleware/rateLimit", () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
  strictLimiter: {},
  lenientLimiter: {},
}));

const prismaMock = vi.hoisted(() => ({
  song: { findMany: vi.fn(), findUnique: vi.fn() },
  licenseToken: { findFirst: vi.fn() },
  transaction: { create: vi.fn() },
}));

vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

import { marketRouter } from "../routes/market";

const MarketListingSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  genre: z.string().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  licensePrice: z.number(),
  revenueSharePct: z.number(),
  totalLicenses: z.number(),
  soldLicenses: z.number(),
  availableLicenses: z.number(),
  aiScore: z.number(),
  district: z.string(),
  versusWins: z.number(),
});

const MarketListingsResponseSchema = z.array(MarketListingSchema);

function buildApp() {
  const app = new Hono();
  app.route("/api/market", marketRouter);
  return app;
}

describe("API contracts: market listings", () => {
  it("returns schema-valid listing payload", async () => {
    prismaMock.song.findMany.mockResolvedValue([
      {
        id: "song-1",
        title: "Stellar Drift",
        artist: "Avalon Reign",
        genre: "Synthwave",
        coverUrl: null,
        licensePrice: 249,
        revenueSharePct: 10,
        totalLicenses: 100,
        soldLicenses: 20,
        aiScore: 82,
        district: "DOWNTOWN_PRIME",
        versusWins: 3,
        createdAt: new Date(),
        isActive: true,
      },
    ]);

    const app = buildApp();
    const res = await app.request("/api/market/listings");

    expect(res.status).toBe(200);

    const body = await res.json();
    const parsed = MarketListingsResponseSchema.safeParse(body);

    expect(parsed.success).toBe(true);
  });
});
