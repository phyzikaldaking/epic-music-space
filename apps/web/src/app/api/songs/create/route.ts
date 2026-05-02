import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { cacheDel, CACHE_KEYS } from "@/lib/redis";
import { enqueueAiScoring, enqueueAnalytics } from "@/lib/queues";
import { getTierLimits } from "@/lib/tierLimits";

const createSongSchema = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().min(1).max(200),
  genre: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  audioUrl: z.string().url("audioUrl must be a valid URL"),
  coverUrl: z.string().url("coverUrl must be a valid URL").optional(),
  bpm: z.coerce.number().int().min(20).max(999).optional(),
  key: z.string().max(10).optional(),
  licensePrice: z.coerce
    .number()
    .min(0.5, "License price must be at least $0.50")
    .max(100_000),
  revenueSharePct: z.coerce
    .number()
    .min(0.01, "Revenue share must be at least 0.01%")
    .max(100),
  totalLicenses: z.coerce.number().int().min(1).max(10_000).default(100),
});

/**
 * POST /api/songs/create
 *
 * Creates a new song listing on the marketplace.
 * Requires an authenticated session with role ARTIST, LABEL, or ADMIN.
 *
 * Body (JSON):
 *   title, artist, genre?, description?, audioUrl, coverUrl?,
 *   bpm?, key?, licensePrice, revenueSharePct, totalLicenses?
 *
 * Returns the created Song object (201).
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await strictLimiter.consume(ip);
  } catch {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.role === "LISTENER") {
    return NextResponse.json(
      { error: "Only artists can upload songs." },
      { status: 403 }
    );
  }

  const limits = getTierLimits(user.subscriptionTier);
  if (limits.maxSongs === 0) {
    return NextResponse.json(
      { error: "Song uploads require a Pro plan or higher. Upgrade at /pricing." },
      { status: 403 }
    );
  }

  if (limits.maxSongs < 999_999) {
    const songCount = await prisma.song.count({ where: { artistId: user.id } });
    if (songCount >= limits.maxSongs) {
      return NextResponse.json(
        { error: `You've reached your ${limits.maxSongs}-song limit. Upgrade your plan at /pricing.` },
        { status: 403 }
      );
    }
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSongSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const song = await prisma.song.create({
    data: {
      ...parsed.data,
      artistId: session.user.id,
    },
  });

  // Invalidate trending cache so new song appears immediately
  await cacheDel(CACHE_KEYS.trendingSongs);

  // Background jobs: AI scoring + analytics
  await enqueueAiScoring(song.id);
  await enqueueAnalytics({
    event: "song_created",
    userId: session.user.id,
    songId: song.id,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(
    {
      ...song,
      licensePrice: Number(song.licensePrice),
      revenueSharePct: Number(song.revenueSharePct),
    },
    { status: 201 }
  );
}
