import crypto from "crypto";
import { put } from "@vercel/blob";
import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@ems/db";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBodyLimited } from "@/lib/apiHardening";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

const MAX_AUDIO_BYTES = 250 * 1024 * 1024;
const allowedTypes = new Set([
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
  "audio/aiff",
  "video/mp4",
]);

function safeName(name: string) {
  return name.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").slice(0, 160) || "audio-file";
}

const peakArraySchema = z.array(z.number().min(0).max(1)).max(10000);
const waveformPeakSchema = z.object({
  resolution: z.string().min(1).max(32).default("overview"),
  channel: z.number().int().min(0).max(32).default(0),
  samplesPerPeak: z.number().int().min(0).max(1_000_000).default(0),
  durationSec: z.number().min(0).max(24 * 60 * 60).default(0),
  sampleRate: z.number().int().min(1).max(768000).nullable().optional(),
  peaks: peakArraySchema,
});

const signedUploadSchema = z.object({
  fileName: z.string().min(1).max(220),
  mimeType: z.string().max(120).nullable().optional(),
  sizeBytes: z.number().int().min(0).max(MAX_AUDIO_BYTES),
  durationSec: z.number().min(0).max(24 * 60 * 60).default(0),
  storageBucket: z.string().min(1).max(80).default("audio"),
  storagePath: z.string().min(1).max(600),
  publicUrl: z.string().url().nullable().optional(),
  checksum: z.string().min(8).max(128).nullable().optional(),
  trackId: z.string().min(1).max(80).nullable().optional(),
  createClip: z.boolean().default(true),
  startSec: z.number().min(0).max(24 * 60 * 60).default(0),
  trimStartSec: z.number().min(0).max(24 * 60 * 60).default(0),
  trimEndSec: z.number().min(0).max(24 * 60 * 60).default(0),
  gainDb: z.number().min(-60).max(24).default(0),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
  color: z.string().min(1).max(16).nullable().optional(),
  peaks: peakArraySchema.optional(),
  waveformPeaks: z.array(waveformPeakSchema).max(8).optional(),
  metadata: z.record(z.unknown()).default({}),
});

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? Number(item) : item))) as T;
}

async function canEdit(projectId: string, userId: string) {
  const project = await prisma.studioProject.findUnique({ where: { id: projectId }, select: { userId: true } });
  if (!project) return { ok: false, status: 404, error: "Project not found" };
  if (project.userId === userId) return { ok: true, status: 200 };
  const rows = await prisma.$queryRaw<Array<{ role: string }>>`
    select role from "StudioProjectCollaborator"
    where "projectId" = ${projectId} and "userId" = ${userId} and status = 'active' and role in ('editor','engineer','owner')
    limit 1
  `;
  return rows.length ? { ok: true, status: 200 } : { ok: false, status: 403, error: "Editor role required" };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const allowed = await canEdit(id, session.user.id);
  if (!allowed.ok) return jsonWithRequestId(requestId, { error: allowed.error }, { status: allowed.status });

  if (req.headers.get("content-type")?.includes("application/json")) {
    const bodyResult = await readJsonBodyLimited<unknown>(req, {
      maxBytes: 512 * 1024,
      invalidMessage: "Expected JSON body",
    });
    if (!bodyResult.ok) return bodyResult.response;

    const parsed = signedUploadSchema.safeParse(bodyResult.value);
    if (!parsed.success) {
      return jsonWithRequestId(
        requestId,
        { error: parsed.error.issues[0]?.message ?? "Invalid studio audio metadata" },
        { status: 400 },
      );
    }

    const data = parsed.data;
    if (data.trackId) {
      const track = await prisma.studioTrack.findUnique({ where: { id: data.trackId }, select: { projectId: true } });
      if (!track || track.projectId !== id) return jsonWithRequestId(requestId, { error: "Track does not belong to this project" }, { status: 400 });
    }

    const waveformPeaks = data.waveformPeaks?.length
      ? data.waveformPeaks
      : data.peaks?.length
        ? [{
            resolution: "overview",
            channel: 0,
            samplesPerPeak: 0,
            durationSec: data.durationSec,
            sampleRate: null,
            peaks: data.peaks,
          }]
        : [];

    const result = await prisma.$transaction(async (tx) => {
      const audioFile = await tx.studioAudioFile.create({
        data: {
          projectId: id,
          uploadedById: session.user.id,
          storageBucket: data.storageBucket,
          storagePath: data.storagePath,
          publicUrl: data.publicUrl ?? null,
          fileName: data.fileName,
          mimeType: data.mimeType ?? null,
          sizeBytes: BigInt(data.sizeBytes),
          durationSec: data.durationSec,
          checksum: data.checksum ?? null,
          peaksJson: data.peaks?.length ? (data.peaks as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });

      for (const peakSet of waveformPeaks) {
        await tx.studioWaveformPeak.upsert({
          where: {
            audioFileId_resolution_channel: {
              audioFileId: audioFile.id,
              resolution: peakSet.resolution,
              channel: peakSet.channel,
            },
          },
          create: {
            audioFileId: audioFile.id,
            resolution: peakSet.resolution,
            channel: peakSet.channel,
            samplesPerPeak: peakSet.samplesPerPeak,
            durationSec: peakSet.durationSec || data.durationSec,
            sampleRate: peakSet.sampleRate ?? null,
            peaks: peakSet.peaks as Prisma.InputJsonValue,
          },
          update: {
            samplesPerPeak: peakSet.samplesPerPeak,
            durationSec: peakSet.durationSec || data.durationSec,
            sampleRate: peakSet.sampleRate ?? null,
            peaks: peakSet.peaks as Prisma.InputJsonValue,
          },
        });
      }

      const clip = data.createClip
        ? await tx.studioClip.create({
            data: {
              projectId: id,
              trackId: data.trackId ?? null,
              name: safeName(data.fileName).replace(/\.[a-z0-9]+$/i, ""),
              audioFileId: audioFile.id,
              startSec: data.startSec,
              durationSec: data.durationSec,
              trimStartSec: data.trimStartSec,
              trimEndSec: data.trimEndSec,
              gainDb: data.gainDb,
              muted: data.muted,
              locked: data.locked,
              color: data.color ?? null,
              peaksJson: data.peaks?.length ? (data.peaks as Prisma.InputJsonValue) : Prisma.JsonNull,
              metadata: data.metadata as Prisma.InputJsonValue,
            },
          })
        : null;

      const peaks = await tx.studioWaveformPeak.findMany({
        where: { audioFileId: audioFile.id },
        orderBy: [{ resolution: "asc" }, { channel: "asc" }],
      });
      return { audioFile, clip, waveformPeaks: peaks };
    });

    return jsonWithRequestId(
      requestId,
      jsonSafe({ ...result, url: data.publicUrl ?? null }),
      { status: 201 },
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return jsonWithRequestId(requestId, { error: "Vercel Blob storage is not configured" }, { status: 503 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonWithRequestId(requestId, { error: "file is required" }, { status: 400 });
  if (file.size <= 0) return jsonWithRequestId(requestId, { error: "Audio file is empty" }, { status: 400 });
  if (file.size > MAX_AUDIO_BYTES) return jsonWithRequestId(requestId, { error: "Audio file is too large" }, { status: 413 });
  if (file.type && !allowedTypes.has(file.type)) return jsonWithRequestId(requestId, { error: "Unsupported audio type" }, { status: 415 });

  const durationSec = Number(form.get("durationSec") ?? 0) || 0;
  const trackId = String(form.get("trackId") ?? "") || null;
  const createClip = String(form.get("createClip") ?? "true") !== "false";
  const startSec = Number(form.get("startSec") ?? 0) || 0;
  const color = String(form.get("color") ?? "#65d6ff");
  const peaksJsonRaw = form.get("peaksJson");
  let peaksJson: unknown = null;
  if (typeof peaksJsonRaw === "string" && peaksJsonRaw.length) {
    try { peaksJson = JSON.parse(peaksJsonRaw); } catch { peaksJson = null; }
  }

  if (trackId) {
    const track = await prisma.studioTrack.findUnique({ where: { id: trackId }, select: { projectId: true } });
    if (!track || track.projectId !== id) return jsonWithRequestId(requestId, { error: "Track does not belong to this project" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const path = `studio/${id}/${Date.now()}-${checksum.slice(0, 12)}-${safeName(file.name)}`;
  const blob = await put(path, bytes, {
    access: "public",
    contentType: file.type || "application/octet-stream",
    addRandomSuffix: false,
  });

  const audioRows = await prisma.$queryRaw<Array<{ id: string }>>`
    insert into "StudioAudioFile" ("projectId", "uploadedById", "storageBucket", "storagePath", "publicUrl", "fileName", "mimeType", "sizeBytes", "durationSec", checksum, "peaksJson")
    values (${id}, ${session.user.id}, ${"vercel-blob"}, ${path}, ${blob.url}, ${file.name}, ${file.type || null}, ${file.size}, ${durationSec}, ${checksum}, ${JSON.stringify(peaksJson ?? [])}::jsonb)
    returning *
  `;
  const audioFile = audioRows[0];

  let clip: unknown = null;
  if (createClip) {
    const clipRows = await prisma.$queryRaw`
      insert into "StudioClip" ("projectId", "trackId", name, "audioFileId", "startSec", "durationSec", color, "peaksJson")
      values (${id}, ${trackId}, ${safeName(file.name).replace(/\.[a-z0-9]+$/i, "")}, ${audioFile.id}, ${startSec}, ${durationSec}, ${color}, ${JSON.stringify(peaksJson ?? [])}::jsonb)
      returning *
    `;
    clip = Array.isArray(clipRows) ? clipRows[0] : clipRows;
  }

  return jsonWithRequestId(requestId, jsonSafe({ audioFile, clip, url: blob.url }), { status: 201 });
}
