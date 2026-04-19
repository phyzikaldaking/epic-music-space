import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { enqueueAiScoring, enqueueAnalytics } from "@/lib/queues";
import { cacheGet, cacheSet, cacheDel, CACHE_KEYS, CACHE_TTL } from "@/lib/redis";
import { strictLimiter, lenientLimiter } from "@/lib/rateLimit";

const createSongSchema = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().min(1).max(200),
  genre: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  audioUrl: z.string().url(),
  coverUrl: z.string().url().optional(),
  bpm: z.coerce.number().int().min(20).max(999).optional(),
  key: z.string().max(10).optional(),
  licensePrice: z.coerce.number().min(0.5).max(100000),
  revenueSharePct: z.coerce.number().min(0.01).max(100),
  totalLicenses: z.coerce.number().int().min(1).max(10000).default(100),
});

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await lenientLimiter.consume(ip);
  } catch {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const cacheKey = CACHE_KEYS.trendingSongs;
  const cached = await cacheGet<unknown[]>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const songs = await prisma.song.findMany({
    where: { isActive: true },
    orderBy: [{ aiScore: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  await cacheSet(cacheKey, songs, CACHE_TTL.trendingSongs);
  return NextResponse.json(songs);
}

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

  const body = await req.json();
  const parsed = createSongSchema.safeParse(body);

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

  // Invalidate trending cache
  await cacheDel(CACHE_KEYS.trendingSongs);

  // Enqueue background AI scoring job
  await enqueueAiScoring(song.id);

  // Enqueue analytics
  await enqueueAnalytics({
    event: "song_uploaded",
    userId: session.user.id,
    songId: song.id,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(song, { status: 201 });
}

