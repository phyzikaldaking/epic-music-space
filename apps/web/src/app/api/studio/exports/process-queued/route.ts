import { put } from "@vercel/blob";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

export const dynamic = "force-dynamic";

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "studio-export";
}

function jsonBuffer(data: unknown) {
  return Buffer.from(JSON.stringify(data, null, 2));
}

function authorized(req: NextRequest) {
  const secret = process.env.STUDIO_EXPORT_WORKER_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  if (!authorized(req)) return jsonWithRequestId(requestId, { error: "Unauthorized worker" }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return jsonWithRequestId(requestId, { error: "Vercel Blob storage is not configured" }, { status: 503 });

  const body = await req.json().catch(() => ({})) as { limit?: number };
  const limit = Math.max(1, Math.min(10, Number(body.limit ?? 3)));

  const jobs = await prisma.$queryRaw<Array<{ id: string; projectId: string; preset: string }>>`
    select id, "projectId", preset
    from "StudioExportJob"
    where status = 'queued'
    order by "createdAt" asc
    limit ${limit}
  `;

  const processed: Array<{ jobId: string; preset: string; status: string; outputUrl?: string; error?: string }> = [];

  for (const job of jobs) {
    await prisma.$executeRaw`
      update "StudioExportJob"
      set status = 'processing', progress = 10, "updatedAt" = current_timestamp
      where id = ${job.id} and status = 'queued'
    `;

    try {
      const project = await prisma.studioProject.findUnique({
        where: { id: job.projectId },
        select: { id: true, name: true, bpm: true, patternJson: true, masterBlobUrl: true, updatedAt: true },
      });
      if (!project) throw new Error("Project not found");

      const [tracks, clips, audioFiles] = await Promise.all([
        prisma.studioTrack.findMany({ where: { projectId: job.projectId }, orderBy: { position: "asc" } }),
        prisma.$queryRaw`select * from "StudioClip" where "projectId" = ${job.projectId} order by "startSec" asc`,
        prisma.$queryRaw`select * from "StudioAudioFile" where "projectId" = ${job.projectId} order by "createdAt" asc`,
      ]);

      const base = {
        project,
        tracks,
        clips,
        audioFiles,
        generatedAt: new Date().toISOString(),
        jobId: job.id,
        preset: job.preset,
      };

      let output: Buffer | null = null;
      let fileName = "";

      if (job.preset === "session_archive") {
        output = jsonBuffer({ ...base, type: "session_archive", note: "Archive manifest with durable source-audio URLs." });
        fileName = `${slug(project.name)}-${job.id}-archive.json`;
      } else if (job.preset === "stems") {
        output = jsonBuffer({ ...base, type: "stems_manifest", note: "Stem manifest grouped from durable audio-file records." });
        fileName = `${slug(project.name)}-${job.id}-stems.json`;
      } else if (job.preset === "social_preview") {
        output = jsonBuffer({ ...base, type: "social_preview_manifest", note: "Social preview manifest for a downstream media renderer." });
        fileName = `${slug(project.name)}-${job.id}-social-preview.json`;
      } else {
        throw new Error("Server audio mixdown is not installed for WAV/MP3 yet. Use browser WAV render or install ffmpeg/lame worker.");
      }

      await prisma.$executeRaw`
        update "StudioExportJob" set progress = 70, "updatedAt" = current_timestamp where id = ${job.id}
      `;

      const blob = await put(`studio-exports/${job.projectId}/${fileName}`, output, {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
      });

      await prisma.$executeRaw`
        update "StudioExportJob"
        set status = 'ready', progress = 100, "outputUrl" = ${blob.url}, "updatedAt" = current_timestamp, "completedAt" = current_timestamp
        where id = ${job.id}
      `;
      processed.push({ jobId: job.id, preset: job.preset, status: "ready", outputUrl: blob.url });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export worker failed";
      await prisma.$executeRaw`
        update "StudioExportJob"
        set status = 'failed', progress = 100, "errorMessage" = ${message}, "updatedAt" = current_timestamp, "completedAt" = current_timestamp
        where id = ${job.id}
      `;
      processed.push({ jobId: job.id, preset: job.preset, status: "failed", error: message });
    }
  }

  return jsonWithRequestId(requestId, { processed, count: processed.length }, { status: 200 });
}
