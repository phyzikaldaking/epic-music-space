import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { CACHE_TAGS } from "@/lib/cacheTags";
import { cacheDel, CACHE_KEYS } from "@/lib/redis";
import { readJsonBodyLimited } from "@/lib/apiHardening";

export const runtime = "nodejs";

const bulkSchema = z.object({
  songIds: z.array(z.string().min(1)).min(1).max(100),
  patch: z
    .object({
      licensePrice: z.coerce.number().min(0.5).max(100_000).optional(),
      revenueSharePct: z.coerce.number().min(0).max(100).optional(),
      totalLicenses: z.coerce.number().int().min(1).max(10_000).optional(),
      isActive: z.boolean().optional(),
      isDraft: z.boolean().optional(),
    })
    .strict()
    .refine((p) => Object.keys(p).length > 0, {
      message: "patch must include at least one field",
    }),
});

/**
 * POST /api/songs/bulk-update
 *
 * Apply the same field changes to many tracks the caller owns. Used by the
 * /studio/manage bulk editor — "set all my tracks to $14.99", "draft these
 * three", "raise rev share to 15%". Capped at 100 ids per request to keep
 * a single shot cheap.
 *
 * Behaviour:
 *  - Filters out songs the caller doesn't own (silent skip — no info leak).
 *  - Refuses to lower totalLicenses below soldLicenses on any individual
 *    song; reports those in `skipped` instead of failing the whole call.
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
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyResult = await readJsonBodyLimited<Record<string, unknown>>(req, {
    maxBytes: 32 * 1024,
  });
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = bulkSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { songIds, patch } = parsed.data;

  const owned = await prisma.song.findMany({
    where: {
      id: { in: songIds },
      ...(session.user.role === "ADMIN" ? {} : { artistId: session.user.id }),
    },
    select: { id: true, soldLicenses: true },
  });

  const skipped: { id: string; reason: string }[] = [];
  const eligible: string[] = [];

  for (const song of owned) {
    if (
      typeof patch.totalLicenses === "number" &&
      patch.totalLicenses < song.soldLicenses
    ) {
      skipped.push({
        id: song.id,
        reason: `would drop totalLicenses below ${song.soldLicenses} sold`,
      });
      continue;
    }
    eligible.push(song.id);
  }

  let updatedCount = 0;
  if (eligible.length > 0) {
    const result = await prisma.song.updateMany({
      where: { id: { in: eligible } },
      data: patch,
    });
    updatedCount = result.count;
  }

  if (updatedCount > 0) {
    await cacheDel(CACHE_KEYS.trendingSongs);
    revalidateTag(CACHE_TAGS.songs, "max");
    revalidateTag(CACHE_TAGS.homepage, "max");
  }

  return NextResponse.json({
    updated: updatedCount,
    skipped,
    requested: songIds.length,
  });
}
