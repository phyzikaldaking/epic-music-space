import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { readJsonBodyLimited } from "@/lib/apiHardening";
import { getRequestId, jsonWithRequestId, withRequestId } from "@/lib/requestTracing";

// Body posted by the client when saving. Tracks carry already-uploaded
// blob URLs (uploads happen via separate POSTs to Vercel Blob, then the
// client commits the project metadata pointing at them).
const trackSchema = z.object({
  id: z.string().min(1).max(40).optional(),
  name: z.string().min(1).max(80),
  color: z.string().min(1).max(16),
  blobUrl: z.string().url().nullable().optional(),
  durationSec: z.number().min(0).max(60 * 60),
  position: z.number().int().min(0).max(64).default(0),
});

const upsertSchema = z.object({
  id: z.string().min(1).max(40).optional(),
  name: z.string().min(1).max(120),
  bpm: z.number().int().min(20).max(300).default(120),
  patternJson: z.unknown().optional(),
  thumbnailPeaks: z.array(z.number().min(0).max(1)).max(120).optional(),
  tracks: z.array(trackSchema).max(48).default([]),
});

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  const projects = await prisma.studioProject.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      bpm: true,
      trackCount: true,
      thumbnailPeaks: true,
      isPublic: true,
      coverArtUrl: true,
      masterBlobUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return jsonWithRequestId(requestId, { projects });
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    await strictLimiter.consume(`studio:projects:${session.user.id}`);
  } catch {
    return jsonWithRequestId(
      requestId,
      { error: "Too many writes — slow down." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  const bodyResult = await readJsonBodyLimited<unknown>(req, {
    maxBytes: 1024 * 1024,
    invalidMessage: "Expected JSON body",
  });
  if (!bodyResult.ok) return withRequestId(bodyResult.response, requestId);

  const parsed = upsertSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonWithRequestId(
      requestId,
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const trackCount = data.tracks.length;

  // Upsert project + replace tracks atomically. Tracks are owned by the
  // project row — on save we wipe and re-insert because the client treats
  // its in-memory engine state as canonical.
  const project = await prisma.$transaction(async (tx) => {
    const where = data.id ? { id: data.id } : undefined;
    const existing = where
      ? await tx.studioProject.findFirst({
          where: { ...where, userId: session.user!.id! },
        })
      : null;

    let projectId: string;
    if (existing) {
      const updated = await tx.studioProject.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          bpm: data.bpm,
          trackCount,
          patternJson: (data.patternJson ?? null) as never,
          thumbnailPeaks: (data.thumbnailPeaks ?? null) as never,
        },
      });
      projectId = updated.id;
      await tx.studioTrack.deleteMany({ where: { projectId } });
    } else {
      const created = await tx.studioProject.create({
        data: {
          name: data.name,
          bpm: data.bpm,
          trackCount,
          patternJson: (data.patternJson ?? null) as never,
          thumbnailPeaks: (data.thumbnailPeaks ?? null) as never,
          user: { connect: { id: session.user!.id! } },
        },
      });
      projectId = created.id;
    }

    if (data.tracks.length > 0) {
      await tx.studioTrack.createMany({
        data: data.tracks.map((t, i) => ({
          projectId,
          name: t.name,
          color: t.color,
          blobUrl: t.blobUrl ?? null,
          durationSec: t.durationSec,
          position: t.position ?? i,
        })),
      });
    }

    return tx.studioProject.findUnique({
      where: { id: projectId },
      include: { tracks: { orderBy: { position: "asc" } } },
    });
  });

  return jsonWithRequestId(requestId, { project });
}

// Defensive: GET/POST only. PUT/DELETE on the collection make no sense
// (use /[id]/route.ts for those).
export async function OPTIONS() {
  return NextResponse.json({}, { status: 204 });
}
