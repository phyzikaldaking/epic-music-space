import crypto from "crypto";
import { put } from "@vercel/blob";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  return jsonWithRequestId(requestId, { audioFile, clip, url: blob.url }, { status: 201 });
}
