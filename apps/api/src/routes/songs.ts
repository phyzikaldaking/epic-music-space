import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "@ems/db";
import { rateLimit, strictLimiter } from "../middleware/rateLimit";
import { authMiddleware } from "../middleware/auth";

const AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/ogg",
  "audio/flac",
  "audio/aac",
  "audio/webm",
  "audio/x-m4a",
  "audio/mp4",
]);

const uploadSchema = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().min(1).max(200),
  genre: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  audioUrl: z.string().url("audioUrl must be a valid URL"),
  coverUrl: z.string().url("coverUrl must be a valid URL").optional(),
  bpm: z.coerce.number().int().min(20).max(999).optional(),
  key: z.string().max(10).optional(),
  licensePrice: z.coerce.number().min(0.5).max(100_000),
  revenueSharePct: z.coerce.number().min(0.01).max(100),
  totalLicenses: z.coerce.number().int().min(1).max(10_000).default(100),
  // Optional: content-type of the audio file for client-side validation
  audioMimeType: z.string().optional(),
});

export const songsRouter = new Hono();

/**
 * POST /api/song/upload
 * Creates a new Song record for an authenticated artist.
 * The audio file must already be uploaded to a CDN/storage (Supabase Storage,
 * S3, etc.) and its public URL provided in `audioUrl`.
 * Optionally validates the MIME type so only audio files are accepted.
 */
songsRouter.post(
  "/upload",
  rateLimit(strictLimiter),
  authMiddleware,
  async (c) => {
    const userId: string = c.get("userId");

    // ── Role check ─────────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    if (user.role === "LISTENER") {
      return c.json({ error: "Only artists can upload songs" }, 403);
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = uploadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        400
      );
    }

    const { audioMimeType, ...songData } = parsed.data;

    // ── Audio-only MIME restriction ────────────────────────────────────────
    if (audioMimeType && !AUDIO_MIME_TYPES.has(audioMimeType.toLowerCase())) {
      return c.json(
        { error: "Only audio files are allowed (mp3, wav, ogg, flac, aac, m4a)" },
        415
      );
    }

    // ── Create song ────────────────────────────────────────────────────────
    const song = await prisma.song.create({
      data: {
        ...songData,
        artistId: userId,
      },
    });

    return c.json(song, 201);
  }
);
