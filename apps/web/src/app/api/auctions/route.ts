import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter } from "@/lib/rateLimit";
import { z } from "zod";

export const runtime = "nodejs";

const createAuctionSchema = z.object({
  songId: z.string().min(1),
  startingBid: z.number().positive().max(100_000),
  reservePrice: z.number().positive().max(100_000).optional(),
  durationHours: z.number().int().min(1).max(168).default(48),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const take = 20;
  const skip = (page - 1) * take;

  const [auctions, total] = await Promise.all([
    prisma.auction.findMany({
      where: { status: "ACTIVE" },
      orderBy: { endsAt: "asc" },
      skip,
      take,
      include: {
        song: { select: { id: true, title: true, artist: true, coverUrl: true, genre: true } },
        seller: { select: { id: true, name: true, username: true, image: true } },
        _count: { select: { bids: true } },
      },
    }),
    prisma.auction.count({ where: { status: "ACTIVE" } }),
  ]);

  return NextResponse.json({ auctions, total, page, pages: Math.ceil(total / take) });
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await moderateLimiter.consume(ip);
  } catch {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["ARTIST", "LABEL", "ADMIN"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Only artists can create auctions" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createAuctionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { songId, startingBid, reservePrice, durationHours } = parsed.data;

  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song || song.artistId !== session.user.id) {
    return NextResponse.json({ error: "Song not found or not yours" }, { status: 404 });
  }
  if (!song.isActive) {
    return NextResponse.json({ error: "Song is not active" }, { status: 409 });
  }
  if (song.soldLicenses >= song.totalLicenses) {
    return NextResponse.json({ error: "No remaining licenses for this song" }, { status: 409 });
  }

  const existing = await prisma.auction.findFirst({
    where: { songId, status: "ACTIVE" },
  });
  if (existing) {
    return NextResponse.json(
      { error: "This song already has an active auction" },
      { status: 409 },
    );
  }

  const endsAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

  const auction = await prisma.auction.create({
    data: {
      songId,
      sellerId: session.user.id,
      startingBid,
      reservePrice: reservePrice ?? null,
      endsAt,
      status: "ACTIVE",
    },
    include: {
      song: { select: { id: true, title: true, artist: true, coverUrl: true } },
    },
  });

  return NextResponse.json(auction, { status: 201 });
}
