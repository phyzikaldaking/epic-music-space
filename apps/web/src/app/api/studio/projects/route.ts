import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@ems/db";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { readJsonBodyLimited } from "@/lib/apiHardening";
import { getRequestId, jsonWithRequestId, withRequestId } from "@/lib/requestTracing";

// Body posted by the client when saving. Tracks carry already-uploaded
// blob URLs (uploads happen via separate POSTs to Vercel Blob, then the
// client commits the project metadata pointing at them).
const trackSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(80),
  kind: z.string().min(1).max(40).default("audio"),
  color: z.string().min(1).max(16),
  gainDb: z.number().min(-60).max(24).default(0),
  pan: z.number().min(-1).max(1).default(0),
  muted: z.boolean().default(false),
  solo: z.boolean().default(false),
  armed: z.boolean().default(false),
  blobUrl: z.string().url().nullable().optional(),
  storagePath: z.string().min(1).max(600).nullable().optional(),
  mimeType: z.string().max(120).nullable().optional(),
  sizeBytes: z.number().int().min(0).max(250 * 1024 * 1024).default(0),
  peaks: z.array(z.number().min(0).max(1)).max(10000).default([]),
  sampleRate: z.number().int().min(1).max(768000).nullable().optional(),
  durationSec: z.number().min(0).max(60 * 60),
  position: z.number().int().min(0).max(64).default(0),
});

const clipSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  trackId: z.string().min(1).max(80).nullable().optional(),
  name: z.string().min(1).max(160),
  audioFileId: z.string().min(1).max(80).nullable().optional(),
  startSec: z.number().min(0).max(60 * 60).default(0),
  durationSec: z.number().min(0).max(60 * 60).default(0),
  trimStartSec: z.number().min(0).max(60 * 60).default(0),
  trimEndSec: z.number().min(0).max(60 * 60).default(0),
  gainDb: z.number().min(-60).max(24).default(0),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
  color: z.string().min(1).max(16).nullable().optional(),
  peaks: z.array(z.number().min(0).max(1)).max(10000).default([]),
  metadata: z.record(z.unknown()).default({}),
});

const upsertSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(120),
  bpm: z.number().int().min(20).max(300).default(120),
  patternJson: z.unknown().optional(),
  thumbnailPeaks: z.array(z.number().min(0).max(1)).max(120).optional(),
  tracks: z.array(trackSchema).max(48).default([]),
  clips: z.array(clipSchema).max(512).default([]),
});

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? Number(item) : item))) as T;
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  // ?templates=1 → return only the user's saved templates (used by the
  // TemplatePicker "My templates" tab). Default returns regular projects
  // and excludes templates so the project list stays clean.
  const url = new URL(req.url);
  const templatesOnly = url.searchParams.get("templates") === "1";

  const projects = await prisma.studioProject.findMany({
    where: {
      userId: session.user.id,
      isTemplate: templatesOnly,
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      bpm: true,
      trackCount: true,
      thumbnailPeaks: true,
      isPublic: true,
      isTemplate: true,
      templateGenre: true,
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
  const userId = session.user!.id!;

  // Prisma's nullable Json columns require explicit Prisma.JsonNull when
  // the caller wants to write a SQL NULL. Without this, `null` in TS
  // becomes a type error and `as never` was the previous (silent) hack.
  // Wrapping once at the boundary keeps the call sites clean (#17).
  const patternJsonValue =
    data.patternJson === undefined || data.patternJson === null
      ? Prisma.JsonNull
      : (data.patternJson as Prisma.InputJsonValue);
  const thumbnailPeaksValue =
    data.thumbnailPeaks === undefined || data.thumbnailPeaks === null
      ? Prisma.JsonNull
      : (data.thumbnailPeaks as Prisma.InputJsonValue);

  // If the client supplied an id, verify ownership BEFORE entering the
  // transaction. Without this, a user posting another user's project id
  // would silently fall into the create branch (because findFirst with
  // userId filter returns null) and a brand-new project gets created
  // with a server-generated id — looks like success but loses their work.
  // Worse: with naïve upsert semantics elsewhere, it could update someone
  // else's row. Refuse with 403 so the client can surface the issue.
  if (data.id) {
    const owner = await prisma.studioProject.findUnique({
      where: { id: data.id },
      select: { userId: true },
    });
    if (owner && owner.userId !== userId) {
      return jsonWithRequestId(
        requestId,
        { error: "Forbidden" },
        { status: 403 },
      );
    }
  }

  const audioFileIds = [...new Set(data.clips.flatMap((clip) => clip.audioFileId ? [clip.audioFileId] : []))];
  if (data.id && audioFileIds.length > 0) {
    const ownedAudioFiles = await prisma.studioAudioFile.findMany({
      where: { id: { in: audioFileIds }, projectId: data.id },
      select: { id: true },
    });
    if (ownedAudioFiles.length !== audioFileIds.length) {
      return jsonWithRequestId(
        requestId,
        { error: "One or more audio clips do not belong to this Studio project." },
        { status: 400 },
      );
    }
  }

  // Upsert project + replace tracks atomically. Tracks are owned by the
  // project row — on save we wipe and re-insert because the client treats
  // its in-memory engine state as canonical.
  const project = await prisma.$transaction(async (tx) => {
    const where = data.id ? { id: data.id } : undefined;
    const existing = where
      ? await tx.studioProject.findFirst({
          where: { ...where, userId },
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
          patternJson: patternJsonValue,
          thumbnailPeaks: thumbnailPeaksValue,
        },
      });
      projectId = updated.id;
      await tx.studioClip.deleteMany({ where: { projectId } });
      await tx.studioTrack.deleteMany({ where: { projectId } });
    } else {
      const created = await tx.studioProject.create({
        data: {
          name: data.name,
          bpm: data.bpm,
          trackCount,
          patternJson: patternJsonValue,
          thumbnailPeaks: thumbnailPeaksValue,
          user: { connect: { id: userId } },
        },
      });
      projectId = created.id;
    }

    if (data.tracks.length > 0) {
      await tx.studioTrack.createMany({
        data: data.tracks.map((t, i) => ({
          ...(t.id ? { id: t.id } : {}),
          projectId,
          name: t.name,
          kind: t.kind,
          color: t.color,
          gainDb: t.gainDb,
          pan: t.pan,
          muted: t.muted,
          solo: t.solo,
          armed: t.armed,
          blobUrl: t.blobUrl ?? null,
          durationSec: t.durationSec,
          position: t.position ?? i,
        })),
      });
    }

    for (const t of data.tracks) {
      if (!t.blobUrl || !t.storagePath) continue;
      const audioFile = await tx.studioAudioFile.create({
        data: {
          projectId,
          uploadedById: userId,
          storageBucket: "audio",
          storagePath: t.storagePath,
          publicUrl: t.blobUrl,
          fileName: `${t.name || "track"}.wav`,
          mimeType: t.mimeType ?? "audio/wav",
          sizeBytes: BigInt(t.sizeBytes ?? 0),
          durationSec: t.durationSec,
          peaksJson: t.peaks.length ? (t.peaks as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });
      if (t.peaks.length) {
        await tx.studioWaveformPeak.create({
          data: {
            audioFileId: audioFile.id,
            resolution: "overview",
            peaks: t.peaks as Prisma.InputJsonValue,
            durationSec: t.durationSec,
            sampleRate: t.sampleRate ?? null,
          },
        });
      }
      await tx.studioClip.create({
        data: {
          projectId,
          trackId: t.id ?? null,
          name: t.name,
          audioFileId: audioFile.id,
          startSec: 0,
          durationSec: t.durationSec,
          trimStartSec: 0,
          trimEndSec: 0,
          gainDb: t.gainDb,
          muted: t.muted,
          locked: false,
          color: t.color,
          peaksJson: t.peaks.length ? (t.peaks as Prisma.InputJsonValue) : Prisma.JsonNull,
          metadata: { source: "track-save" },
        },
      });
    }

    if (data.clips.length > 0) {
      await tx.studioClip.createMany({
        data: data.clips.map((clip) => ({
          ...(clip.id ? { id: clip.id } : {}),
          projectId,
          trackId: clip.trackId ?? null,
          name: clip.name,
          audioFileId: clip.audioFileId ?? null,
          startSec: clip.startSec,
          durationSec: clip.durationSec,
          trimStartSec: clip.trimStartSec,
          trimEndSec: clip.trimEndSec,
          gainDb: clip.gainDb,
          muted: clip.muted,
          locked: clip.locked,
          color: clip.color ?? null,
          peaksJson: clip.peaks.length ? (clip.peaks as Prisma.InputJsonValue) : Prisma.JsonNull,
          metadata: clip.metadata as Prisma.InputJsonValue,
        })),
      });
    }

    return tx.studioProject.findUnique({
      where: { id: projectId },
      include: {
        tracks: { orderBy: { position: "asc" } },
        clips: { orderBy: { startSec: "asc" } },
        audioFiles: { orderBy: { createdAt: "desc" }, include: { waveformPeaks: true } },
      },
    });
  });

  return jsonWithRequestId(requestId, jsonSafe({ project }));
}

// Defensive: GET/POST only. PUT/DELETE on the collection make no sense
// (use /[id]/route.ts for those).
export async function OPTIONS() {
  return NextResponse.json({}, { status: 204 });
}
