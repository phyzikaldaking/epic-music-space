import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter } from "@/lib/rateLimit";
import { z } from "zod";

export const runtime = "nodejs";

const createResaleSchema = z.object({
  licenseTokenId: z.string().min(1),
  resalePrice: z.number().positive().max(1_000_000),
});

/**
 * GET /api/resales
 * List active resale listings.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const take = 20;
  const skip = (page - 1) * take;
  const songId = searchParams.get("songId") ?? undefined;

  const [listings, total] = await Promise.all([
    prisma.resaleListing.findMany({
      where: { status: "ACTIVE", ...(songId ? { songId } : {}) },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        song: { select: { id: true, title: true, artist: true, coverUrl: true, licensePrice: true } },
        seller: { select: { id: true, name: true, username: true, image: true } },
        licenseToken: { select: { id: true, tokenNumber: true, holderId: true, songId: true } },
      },
    }),
    prisma.resaleListing.count({
      where: { status: "ACTIVE", ...(songId ? { songId } : {}) },
    }),
  ]);

  return NextResponse.json({ listings, total, page, pages: Math.ceil(total / take) });
}

/**
 * POST /api/resales
 * Create a resale listing for an owned license token.
 */
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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createResaleSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { licenseTokenId, resalePrice } = parsed.data;

  const license = await prisma.licenseToken.findUnique({
    where: { id: licenseTokenId },
    include: { song: { select: { id: true, isActive: true } } },
  });

  if (!license || license.status !== "ACTIVE") {
    return NextResponse.json({ error: "License not found" }, { status: 404 });
  }
  if (license.holderId !== session.user.id) {
    return NextResponse.json({ error: "Not your license" }, { status: 403 });
  }
  if (!license.song.isActive) {
    return NextResponse.json({ error: "Song is not active" }, { status: 409 });
  }

  const existing = await prisma.resaleListing.findFirst({
    where: { licenseTokenId, status: "ACTIVE" },
  });
  if (existing) {
    return NextResponse.json({ error: "Already listed" }, { status: 409 });
  }

  const listing = await prisma.resaleListing.create({
    data: {
      licenseTokenId,
      songId: license.songId,
      sellerId: session.user.id,
      resalePrice,
      status: "ACTIVE",
    },
    include: {
      song: { select: { id: true, title: true, artist: true, coverUrl: true } },
      licenseToken: { select: { id: true, tokenNumber: true } },
    },
  });

  return NextResponse.json(listing, { status: 201 });
}

