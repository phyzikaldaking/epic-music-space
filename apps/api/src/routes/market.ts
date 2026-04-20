import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "@ems/db";
import Stripe from "stripe";
import { rateLimit, strictLimiter, lenientLimiter } from "../middleware/rateLimit";
import { authMiddleware } from "../middleware/auth";

// ─────────────────────────────────────────────────────────
// Stripe
// ─────────────────────────────────────────────────────────

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2024-11-20.acacia", typescript: true });
}

// ─────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────

const buySchema = z.object({
  songId: z.string().min(1, "songId is required"),
  quantity: z.number().int().min(1).max(100).default(1),
});

// ─────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────

export const marketRouter = new Hono();

/**
 * GET /api/market/listings
 * Returns all active songs that still have licenses available.
 * Results are sorted by AI score (descending) and cached via Redis TTL on the
 * web layer — this endpoint returns fresh data from the database.
 */
marketRouter.get(
  "/listings",
  rateLimit(lenientLimiter),
  async (c) => {
    // Fetch all active songs then filter in-memory for cross-column comparison
    // (soldLicenses < totalLicenses). For large datasets, use a raw query.
    const allActive = await prisma.song.findMany({
      where: { isActive: true },
      orderBy: [{ aiScore: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        artist: true,
        genre: true,
        coverUrl: true,
        licensePrice: true,
        revenueSharePct: true,
        totalLicenses: true,
        soldLicenses: true,
        aiScore: true,
        district: true,
        versusWins: true,
        createdAt: true,
      },
      take: 200,
    });

    // Keep only listings that still have licenses available
    const result = allActive
      .filter((s) => s.soldLicenses < s.totalLicenses)
      .slice(0, 100)
      .map((s) => ({
        ...s,
        availableLicenses: s.totalLicenses - s.soldLicenses,
        licensePrice: Number(s.licensePrice),
        revenueSharePct: Number(s.revenueSharePct),
      }));

    return c.json(result);
  }
);

/**
 * POST /api/market/buy
 * Initiates a Stripe checkout session to purchase one or more licenses for a
 * song.  On successful payment the Stripe webhook in apps/web fulfils the
 * license atomically.
 *
 * Body: { songId: string; quantity?: number }
 * Auth: Bearer token required
 */
marketRouter.post(
  "/buy",
  rateLimit(strictLimiter),
  authMiddleware,
  async (c) => {
    const userId: string = c.get("userId");

    // ── Parse + validate body ──────────────────────────────────────────────
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = buySchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        400
      );
    }

    const { songId, quantity } = parsed.data;

    // ── Fetch song ─────────────────────────────────────────────────────────
    const song = await prisma.song.findUnique({ where: { id: songId } });
    if (!song || !song.isActive) {
      return c.json({ error: "Song not found" }, 404);
    }

    // ── Check availability ─────────────────────────────────────────────────
    const available = song.totalLicenses - song.soldLicenses;
    if (available <= 0) {
      return c.json({ error: "This song is sold out" }, 409);
    }
    if (quantity > available) {
      return c.json(
        { error: `Only ${available} license(s) available` },
        409
      );
    }

    // ── Duplicate ownership check (one per user per song) ──────────────────
    if (quantity === 1) {
      const existing = await prisma.licenseToken.findFirst({
        where: { songId, holderId: userId, status: "ACTIVE" },
      });
      if (existing) {
        return c.json(
          { error: "You already hold a license for this song" },
          409
        );
      }
    }

    // ── Stripe checkout session ────────────────────────────────────────────
    const stripe = getStripe();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const unitAmount = Math.round(Number(song.licensePrice) * 100);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: unitAmount,
            product_data: {
              name: `License: ${song.title} by ${song.artist}`,
              description: `Digital music license — ${String(song.revenueSharePct)}% revenue share per license`,
              images: song.coverUrl ? [song.coverUrl] : [],
            },
          },
          quantity,
        },
      ],
      metadata: { songId, userId, quantity: String(quantity) },
      success_url: `${baseUrl}/studio/${songId}?checkout=success`,
      cancel_url: `${baseUrl}/studio/${songId}?checkout=cancelled`,
    });

    // ── Record pending transaction ─────────────────────────────────────────
    await prisma.transaction.create({
      data: {
        userId,
        songId,
        amount: Number(song.licensePrice) * quantity,
        type: "LICENSE_PURCHASE",
        status: "PENDING",
        stripeSessionId: session.id,
        metadata: { quantity },
      },
    });

    return c.json({ checkoutUrl: session.url }, 201);
  }
);
