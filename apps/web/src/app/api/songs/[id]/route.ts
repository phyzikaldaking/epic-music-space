import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { CACHE_TAGS } from "@/lib/cacheTags";
import { cacheDel, CACHE_KEYS } from "@/lib/redis";
import { readJsonBodyLimited } from "@/lib/apiHardening";
import { fanoutSavedArtistDrop } from "@/lib/savedReleaseNotifications";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Whitelisted fields. Cover/audio swaps go through the upload pipeline,
// not this endpoint — only metadata and listing controls live here.
const updateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    genre: z.string().max(100).nullable().optional(),
    bpm: z.coerce.number().int().min(20).max(999).nullable().optional(),
    key: z.string().max(10).nullable().optional(),
    licensePrice: z.coerce.number().min(0.5).max(100_000).optional(),
    revenueSharePct: z.coerce.number().min(0).max(100).optional(),
    totalLicenses: z.coerce.number().int().min(1).max(10_000).optional(),
    isActive: z.boolean().optional(),
    isDraft: z.boolean().optional(),
    scheduledAt: z
      .union([z.string().datetime(), z.null()])
      .optional()
      .transform((v) => (v == null ? v : new Date(v))),
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
      .nullable()
      .optional(),
  })
  .strict();

/**
 * PATCH /api/songs/[id]
 *
 * Update producer-controlled metadata and listing controls on a track the
 * caller owns. Returns the updated row. Rejects field-name mismatches
 * (`.strict()`) so a typo can't silently no-op.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
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

  const { id } = await params;

  const song = await prisma.song.findUnique({
    where: { id },
    select: {
      artistId: true,
      soldLicenses: true,
      isActive: true,
      isDraft: true,
      scheduledAt: true,
    },
  });
  if (!song) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (song.artistId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const bodyResult = await readJsonBodyLimited<Record<string, unknown>>(req, {
    maxBytes: 16 * 1024,
  });
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = updateSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Once a track has sold licenses, totalLicenses can only go UP. Lowering
  // it below soldLicenses would orphan real holders and violate the cap.
  if (
    typeof data.totalLicenses === "number" &&
    data.totalLicenses < song.soldLicenses
  ) {
    return NextResponse.json(
      {
        error: `Cannot reduce total licenses below ${song.soldLicenses} — that many have already been sold.`,
      },
      { status: 400 },
    );
  }

  // Strip undefined so we don't unintentionally null-out fields. Also coerce
  // licenseVariants to Prisma's JSON null when explicitly cleared.
  const updateData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) updateData[k] = v;
  }

  const updated = await prisma.song.update({
    where: { id },
    data: updateData,
  });

  const wasPublic =
    song.isActive &&
    !song.isDraft &&
    (song.scheduledAt == null || song.scheduledAt.getTime() <= Date.now());
  const isPublic =
    updated.isActive &&
    !updated.isDraft &&
    (updated.scheduledAt == null || updated.scheduledAt.getTime() <= Date.now());

  if (!wasPublic && isPublic) {
    try {
      await fanoutSavedArtistDrop(updated.id);
    } catch (err) {
      console.warn("[songs:update] saved-drop fanout failed", err);
    }
  }

  await cacheDel(CACHE_KEYS.trendingSongs);
  revalidateTag(CACHE_TAGS.songs, "max");
  revalidateTag(CACHE_TAGS.homepage, "max");

  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    licensePrice: Number(updated.licensePrice),
    revenueSharePct: Number(updated.revenueSharePct),
    totalLicenses: updated.totalLicenses,
    soldLicenses: updated.soldLicenses,
    isActive: updated.isActive,
    isDraft: updated.isDraft,
    scheduledAt: updated.scheduledAt?.toISOString() ?? null,
    licenseVariants: updated.licenseVariants,
  });
}

/**
 * DELETE /api/songs/[id]
 *
 * Soft-archives a track by toggling isActive=false. We never hard-delete a
 * Song row that has sold licenses — license holders' receipts must keep
 * resolving — so callers must check ownership and we just hide it.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const song = await prisma.song.findUnique({
    where: { id },
    select: { artistId: true },
  });
  if (!song) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (song.artistId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.song.update({ where: { id }, data: { isActive: false } });

  await cacheDel(CACHE_KEYS.trendingSongs);
  revalidateTag(CACHE_TAGS.songs, "max");
  revalidateTag(CACHE_TAGS.homepage, "max");

  return NextResponse.json({ success: true });
}
