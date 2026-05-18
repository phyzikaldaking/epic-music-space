import { put } from "@vercel/blob";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

async function canProcess(projectId: string, userId: string) {
  const project = await prisma.studioProject.findUnique({ where: { id: projectId }, select: { userId: true, name: true, bpm: true, patternJson: true, masterBlobUrl: true } });
  if (!project) return { ok: false as const, status: 404, error: "Project not found" };
  if (project.userId === userId) return { ok: true as const, status: 200, project };
  const rows = await prisma.$queryRaw<Array<{ role: string }>>`
    select role from "StudioProjectCollaborator"
    where "projectId" = ${projectId} and "userId" = ${userId} and status = 'active' and role in ('engineer','owner')
    limit 1
  `;
  return rows.length ? { ok: true as const, status: 200, project } : { ok: false as const, status: 403, error: "Engineer or owner role required" };
}

function jsonBlob(data: unknown) {
  return Buffer.from(JSON.stringify(data, null, 2));
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "studio-export";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; jobId: string }> }) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return jsonWithRequestId(requestId, { error: "Vercel Blob storage is not configured" }, { status: 503 });

  const { id, jobId } = await params;
  const allowed = await canProcess(id, session.user.id);
  if (!allowed.ok) return jsonWithRequestId(requestId, { error: allowed.error }, { status: allowed.status });

  const jobs = await prisma.$queryRaw<Array<{ id: string; preset: string; status: string; metadata: unknown }>>`
    select id, preset, status, metadata from "StudioExportJob" where id = ${jobId} and "projectId" = ${id} limit 1
  `;
  const job = jobs[0];
  if (!job) return jsonWithRequestId(requestId, { error: "Export job not found" }, { status: 404 });
  if (job.status === "ready") return jsonWithRequestId(requestId, { error: "Export job is already ready" }, { status: 409 });

  await prisma.$executeRaw`
    update "StudioExportJob" set status = 'processing', progress = 15, "updatedAt" = current_timestamp where id = ${jobId}
  `;

  const [tracks, clips, audioFiles] = await Promise.all([
    prisma.studioTrack.findMany({ where: { projectId: id }, orderBy: { position: "asc" } }),
    prisma.$queryRaw`select * from "StudioClip" where "projectId" = ${id} order by "startSec" asc`,
    prisma.$queryRaw`select * from "StudioAudioFile" where "projectId" = ${id} order by "createdAt" asc`,
  ]);

  const base = {
    project: allowed.project,
    tracks,
    clips,
    audioFiles,
    generatedAt: new Date().toISOString(),
    jobId,
    preset: job.preset,
  };

  let output: Buffer;
  let fileName: string;
  const contentType = "application/json";

  if (job.preset === "session_archive") {
    output = jsonBlob({ ...base, type: "session_archive", note: "Archive manifest for restoring a studio session plus durable audio URLs." });
    fileName = `${slug(allowed.project.name)}-${jobId}-archive.json`;
  } else if (job.preset === "stems") {
    output = jsonBlob({ ...base, type: "stems_manifest", note: "Stem export manifest. Audio files are preserved as durable URLs; no fake audio rendering is performed." });
    fileName = `${slug(allowed.project.name)}-${jobId}-stems.json`;
  } else if (job.preset === "social_preview") {
    output = jsonBlob({ ...base, type: "social_preview_manifest", note: "Social preview manifest for a downstream media renderer." });
    fileName = `${slug(allowed.project.name)}-${jobId}-social-preview.json`;
  } else {
    await prisma.$executeRaw`
      update "StudioExportJob"
      set status = 'failed', progress = 100, "errorMessage" = ${"Server-side WAV/MP3 mixdown renderer is not configured yet. Use browser OfflineAudioContext or a worker with ffmpeg/audio decode."}, "updatedAt" = current_timestamp, "completedAt" = current_timestamp
      where id = ${jobId}
    `;
    return jsonWithRequestId(requestId, {
      error: "Renderer not configured",
      detail: "This endpoint will not fake a WAV/MP3 master. It queues the real job and fails clearly until the audio renderer is installed.",
    }, { status: 501 });
  }

  await prisma.$executeRaw`
    update "StudioExportJob" set progress = 70, "updatedAt" = current_timestamp where id = ${jobId}
  `;

  const blob = await put(`studio-exports/${id}/${fileName}`, output, {
    access: "public",
    contentType,
    addRandomSuffix: false,
  });

  await prisma.$executeRaw`
    update "StudioExportJob"
    set status = 'ready', progress = 100, "outputUrl" = ${blob.url}, "updatedAt" = current_timestamp, "completedAt" = current_timestamp
    where id = ${jobId}
  `;

  return jsonWithRequestId(requestId, { jobId, preset: job.preset, outputUrl: blob.url }, { status: 200 });
}
