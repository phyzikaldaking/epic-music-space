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
import { fanoutSavedArtistDrop } from "@/lib/savedReleaseNotifications";

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
  // Pay-what-you-want: producer opts in; licensePrice becomes the floor.
  payWhatYouWant: z.boolean().default(false),
  isLegacy: z.boolean().default(false),
  originalReleaseYear: z.coerce
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear())
    .optional(),
  bpm: z.coerce.number().int().min(20).max(999).optional(),
  key: z.string().max(10).optional(),
  // Integrated LUFS captured from the studio master analyser at the
  // moment of publish. Optional because non-studio uploads (paste URL,
  // import) won't have it. Range gates against malformed values from
  // hand-crafted requests.
  masterLufs: z.coerce.number().min(-60).max(0).optional(),
  licensePrice: z.coerce
    .number()
    .min(0.5, "License price must be at least $0.50")
    .max(100_000),
  // 0% means "no future revenue share is granted to license holders" — a
  // valid creator choice for one-time license sales. The slider in the
  // quick flow caps the floor at 1%, but we accept 0 here so power users
  // and the API can opt out cleanly.
  revenueSharePct: z.coerce.number().min(0, "Revenue share cannot be negative").max(100),
  totalLicenses: z.coerce.number().int().min(1).max(10_000).default(100),
  // Drafts: client posts isDraft=true to stash the song without making it
  // public. The draft still needs full validation so flipping it live
  // later doesn't surprise the producer with a hidden gate.
  isDraft: z.boolean().optional(),
  // Scheduled release. Cron flips isDraft -> false at this time. Must be
  // in the future at submission time.
  scheduledAt: z
    .string()
    .datetime()
    .refine((s) => new Date(s).getTime() > Date.now(), {
      message: "Scheduled release must be in the future.",
    })
    .optional(),
  // Tiered licensing. Each entry adds a buyable tier on top of the base
  // licensePrice (always the BASIC tier).
  licenseVariants: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        name: z.string().min(1).max(60),
        priceUsd: z.number().min(0.5).max(100_000),
        terms: z.string().max(500).optional(),
        totalLicenses: z.number().int().min(1).max(10_000).optional(),
      }),
    )
    .max(6)
    .optional(),
  // Auto-credit metadata (#30). Optional. The studio prefills this with
  // the kit / template / contributors that contributed to the mix. We
  // validate shape but don't enforce that contributors are real user IDs
  // here — track-page rendering soft-validates and shows "@unknown" for
  // missing accounts rather than rejecting the publish.
  credits: z
    .object({
      beatKit: z.string().max(40).optional(),
      beatKitLabel: z.string().max(80).optional(),
      templateId: z.string().max(40).optional(),
      templateName: z.string().max(120).optional(),
      contributors: z
        .array(
          z.object({
            userId: z.string().max(40).optional(),
            role: z.string().min(1).max(40),
            label: z.string().min(1).max(120),
          }),
        )
        .max(12)
        .optional(),
    })
    .optional(),
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

  // Pull scheduledAt out of parsed.data so we can convert string -> Date
  // before handing it to Prisma (the field is DateTime in the schema).
  const { scheduledAt, licenseVariants, credits, ...restCreate } = parsed.data;

  const song = await prisma.song.create({
    data: {
      ...restCreate,
      artistId: session.user.id,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      // licenseVariants is JSON in the DB. Prisma's typed input expects
      // the JSON shape, but our zod schema has already validated structure.
      licenseVariants: licenseVariants ?? undefined,
      // Auto-credit JSON — already shape-validated by the zod schema
      // above. Renders on the track page as a "Credits" panel.
      credits: credits ?? undefined,
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

  // New-drop fanout: users who saved tracks from this artist get a
  // notification (in-app + push + optional email) when a track is
  // immediately public. Draft/scheduled releases are notified later when
  // they are actually published.
  if (song.isActive && !song.isDraft && !song.scheduledAt) {
    try {
      await fanoutSavedArtistDrop(song.id);
    } catch (err) {
      console.warn("[songs:create] saved-drop fanout failed", err);
    }
  }

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
  revalidateTag(CACHE_TAGS.songs, "max");
  revalidateTag(CACHE_TAGS.homepage, "max");
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
