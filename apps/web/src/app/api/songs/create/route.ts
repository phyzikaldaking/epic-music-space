import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { cacheDel, CACHE_KEYS } from "@/lib/redis";
import { enqueueAiScoring, enqueueAnalytics } from "@/lib/queues";
import { getActiveLimits } from "@/lib/tierLimits";
import { track } from "@/lib/analytics";
import { CACHE_TAGS } from "@/lib/cacheTags";
import { classifyAudioSource } from "@/lib/audioSource";

const createSongSchema = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().min(1).max(200),
  genre: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  audioUrl: z.string().url("audioUrl must be a valid URL"),
  coverUrl: z.string().url("coverUrl must be a valid URL").optional(),
  stemUrl: z.string().url("stemUrl must be a valid URL").optional(),
  hasStems: z.boolean().default(false),
  allowFreeDownload: z.boolean().default(false),
  isLegacy: z.boolean().default(false),
  originalReleaseYear: z.coerce
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear())
    .optional(),
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

  const limits = getActiveLimits(user);
  const existingSongCount = await prisma.song.count({ where: { artistId: user.id } });

  if (limits.maxSongs < 999_999 && existingSongCount >= limits.maxSongs) {
    return NextResponse.json(
      {
        error: `You've reached your ${limits.maxSongs}-song limit on your current plan. Upgrade at /pricing to upload more.`,
        upgradeUrl: "/pricing",
      },
      { status: 403 }
    );
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

  // Defense-in-depth: classify the audioUrl server-side and reject any
  // unrecognised source. The client form already does this, but we can't
  // trust it — without this gate, a malicious client could persist a song
  // pointing at attacker-controlled bytes which the stream proxy would
  // then try to fetch on every play.
  const audioClass = classifyAudioSource(parsed.data.audioUrl);
  if (audioClass.type === "unknown") {
    return NextResponse.json(
      {
        error:
          "audioUrl must be a direct audio file or a YouTube / Vimeo / SoundCloud / Spotify link.",
      },
      { status: 400 }
    );
  }

  const song = await prisma.song.create({
    data: {
      ...parsed.data,
      artistId: session.user.id,
    },
  });

  // Auto-create a Studio for the artist if they don't have one yet
  const existingStudio = await prisma.studio.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!existingStudio) {
    const baseSlug = (user.name ?? parsed.data.artist ?? "artist")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 28) || "artist";
    // Ensure uniqueness by appending a short id suffix if taken
    const taken = await prisma.studio.findFirst({ where: { username: baseSlug }, select: { id: true } });
    const username = taken ? `${baseSlug}-${user.id.slice(-4)}` : baseSlug;
    await prisma.studio.create({
      data: { userId: user.id, username },
    }).catch(() => { /* race condition — another request already created it */ });
  }

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

  if (existingSongCount === 0) {
    track({
      event: "funnel_artist_signup_to_first_upload",
      userId: session.user.id,
      properties: {
        songId: song.id,
        role: user.role,
      },
    });
  }

  // Bust cached homepage / track / songs surfaces so the new track shows up immediately.
  revalidateTag(CACHE_TAGS.songs);
  revalidateTag(CACHE_TAGS.homepage);
  // /vault uses route-level `export const revalidate = 60` rather than a
  // tagged cache, so revalidateTag alone won't bust it. Path-level
  // revalidation guarantees an artist returning to /vault after a
  // legacy publish sees their tape on the shelf immediately.
  if (parsed.data.isLegacy) {
    revalidatePath("/vault");
  }

  // Strip raw upstream audio URL — clients use the proxy.
  const { publicSong } = await import("@/lib/serializeSong");
  return NextResponse.json(
    publicSong({
      ...song,
      licensePrice: Number(song.licensePrice),
      revenueSharePct: Number(song.revenueSharePct),
    }),
    { status: 201 },
  );
}
