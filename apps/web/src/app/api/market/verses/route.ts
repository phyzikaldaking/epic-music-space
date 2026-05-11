import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";

export const runtime = "nodejs";

const createSchema = z.object({
  kind: z.enum(["LIVE_SESSION", "ASYNC_DELIVERY"]),
  title: z.string().min(3).max(120),
  description: z.string().max(2000).optional(),
  priceUsd: z.number().min(5).max(50_000),
  sessionMinutes: z.number().int().min(15).max(360).optional(),
  deliveryDays: z.number().int().min(1).max(30).optional(),
  previewSongId: z.string().max(64).optional(),
  tags: z.array(z.string().max(30)).max(8).optional(),
});

// GET /api/market/verses — list active verse listings, filterable by
// kind / tag. Powers the marketplace browse view.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const tag = url.searchParams.get("tag");
  const sellerId = url.searchParams.get("sellerId");

  const listings = await prisma.verseListing.findMany({
    where: {
      status: "ACTIVE",
      ...(kind && (kind === "LIVE_SESSION" || kind === "ASYNC_DELIVERY")
        ? { kind }
        : {}),
      ...(tag ? { tags: { has: tag } } : {}),
      ...(sellerId ? { sellerId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      seller: {
        select: {
          id: true,
          name: true,
          username: true,
          image: true,
          subscriptionTier: true,
        },
      },
    },
  });

  return NextResponse.json({ listings });
}

// POST /api/market/verses — create a verse listing. PRO+ tier-gated;
// the artist must also have completed Stripe Connect KYC so we can
// route payouts.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const blocked = await rateLimit("moderate", `market:verse:${session.user.id}`);
  if (blocked) return blocked;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      subscriptionTier: true,
      stripeConnectId: true,
      connectDetailsSubmitted: true,
    },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!["PRO", "PRIME", "TEAM", "LABEL_TIER"].includes(user.subscriptionTier)) {
    return NextResponse.json(
      { error: "Verse listings require PRO or higher tier.", upgradeHint: true },
      { status: 403 },
    );
  }
  if (!user.stripeConnectId || !user.connectDetailsSubmitted) {
    return NextResponse.json(
      {
        error:
          "Complete Stripe Connect onboarding before listing verses — we need a payout route before money can flow.",
        connectHint: true,
      },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as unknown;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const data = parsed.data;
  // Verify previewSongId if provided is one of the seller's own
  // tracks — we don't let an artist preview someone else's song.
  if (data.previewSongId) {
    const song = await prisma.song.findFirst({
      where: { id: data.previewSongId, artistId: session.user.id },
      select: { id: true },
    });
    if (!song) {
      return NextResponse.json(
        { error: "Preview song must be one of yours." },
        { status: 400 },
      );
    }
  }

  const listing = await prisma.verseListing.create({
    data: {
      sellerId: session.user.id,
      kind: data.kind,
      title: data.title,
      description: data.description ?? null,
      priceUsd: data.priceUsd,
      sessionMinutes: data.kind === "LIVE_SESSION" ? data.sessionMinutes ?? 60 : 60,
      deliveryDays: data.kind === "ASYNC_DELIVERY" ? data.deliveryDays ?? 3 : 3,
      previewSongId: data.previewSongId ?? null,
      tags: data.tags ?? [],
    },
  });

  return NextResponse.json({ listing }, { status: 201 });
}
