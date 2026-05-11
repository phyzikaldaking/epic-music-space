import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { readJsonBodyLimited } from "@/lib/apiHardening";
import {
  getRequestId,
  jsonWithRequestId,
  withRequestId,
} from "@/lib/requestTracing";

// Drum kit pack marketplace (#29). GET lists public packs (with optional
// genre filter); POST creates a draft pack from a sample manifest the
// producer has already uploaded to Vercel Blob. Featured + downloadCount
// drive the browse modal's sort order.

export const runtime = "nodejs";

const DRUM_LANES = [
  "kick",
  "snare",
  "clap",
  "hat",
  "openHat",
  "perc",
  "bass808",
  "crash",
] as const;

const samplesSchema = z
  .record(z.enum(DRUM_LANES), z.string().url())
  .refine((s) => Object.keys(s).length >= 2, "Pack needs at least 2 lanes");

const postSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  genre: z.string().max(40).optional(),
  bpm: z.number().int().min(40).max(240).optional(),
  coverUrl: z.string().url().optional(),
  samples: samplesSchema,
  priceUsd: z.number().min(0).max(999.99).optional(),
});

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const url = new URL(req.url);
  const genre = url.searchParams.get("genre");
  const featured = url.searchParams.get("featured") === "1";
  const authorId = url.searchParams.get("authorId");

  const where: {
    isPublic: boolean;
    genre?: string;
    isFeatured?: boolean;
    authorId?: string;
  } = { isPublic: true };
  if (genre) where.genre = genre;
  if (featured) where.isFeatured = true;
  if (authorId) where.authorId = authorId;

  const packs = await prisma.drumKitPack.findMany({
    where,
    orderBy: [{ isFeatured: "desc" }, { downloadCount: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      name: true,
      description: true,
      genre: true,
      bpm: true,
      coverUrl: true,
      samples: true,
      priceUsd: true,
      isFeatured: true,
      downloadCount: true,
      createdAt: true,
      author: { select: { id: true, name: true } },
    },
  });

  return jsonWithRequestId(requestId, { packs });
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    await strictLimiter.consume(`kit-packs:create:${session.user.id}`);
  } catch {
    return jsonWithRequestId(
      requestId,
      { error: "Slow down — try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const bodyResult = await readJsonBodyLimited<unknown>(req, {
    maxBytes: 16 * 1024,
    invalidMessage: "Expected JSON body",
  });
  if (!bodyResult.ok) return withRequestId(bodyResult.response, requestId);

  const parsed = postSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonWithRequestId(
      requestId,
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const pack = await prisma.drumKitPack.create({
    data: {
      authorId: session.user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      genre: parsed.data.genre ?? null,
      bpm: parsed.data.bpm ?? null,
      coverUrl: parsed.data.coverUrl ?? null,
      samples: parsed.data.samples,
      priceUsd: parsed.data.priceUsd ?? null,
      isPublic: false, // drafts only; publishing is a separate PATCH
    },
  });

  return jsonWithRequestId(requestId, { pack });
}
