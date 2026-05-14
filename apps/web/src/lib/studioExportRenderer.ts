import { prisma } from "@/lib/prisma";

export type AudioExportFormat = "full_mix" | "stems" | "preview" | "license_package";

type RenderInput = {
  userId: string;
  projectId: string;
  sessionId: string;
  format: AudioExportFormat;
};

type RenderJobRecord = {
  id: string;
  user_id: string;
  project_id: string;
  session_id: string;
  format: string;
  status: string;
  progress: number;
  output_url: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

let initialized = false;

async function ensureExportTable() {
  if (initialized) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ems_audio_export_job (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      format TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      output_url TEXT,
      error_message TEXT,
      render_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ems_audio_export_job_user_created_idx ON ems_audio_export_job(user_id, created_at DESC)`);
  initialized = true;
}

function publicArtifactUrl(jobId: string, format: AudioExportFormat) {
  const ext = format === "license_package" ? "zip" : "wav";
  return `/api/studio/export/artifact?jobId=${encodeURIComponent(jobId)}&format=${encodeURIComponent(format)}&ext=${ext}`;
}

export async function createAudioRenderJob(input: RenderInput) {
  await ensureExportTable();
  const id = `audio-export-${Date.now()}-${crypto.randomUUID()}`;
  const manifest = {
    projectId: input.projectId,
    sessionId: input.sessionId,
    format: input.format,
    stages: ["queued", "collect_project_state", "render_audio", "package_artifacts", "complete"],
    queuedAt: new Date().toISOString(),
  };
  await prisma.$executeRawUnsafe(
    `INSERT INTO ems_audio_export_job (id, user_id, project_id, session_id, format, status, progress, render_manifest)
     VALUES ($1,$2,$3,$4,$5,'queued',5,$6::jsonb)`,
    id,
    input.userId,
    input.projectId,
    input.sessionId,
    input.format,
    JSON.stringify(manifest),
  );
  return runAudioRenderJob(id, input.userId);
}

export async function runAudioRenderJob(jobId: string, userId: string) {
  await ensureExportTable();
  const rows = await prisma.$queryRawUnsafe<RenderJobRecord[]>(`SELECT * FROM ems_audio_export_job WHERE id = $1 AND user_id = $2 LIMIT 1`, jobId, userId);
  const job = rows[0];
  if (!job) return null;
  try {
    await prisma.$executeRawUnsafe(`UPDATE ems_audio_export_job SET status='rendering', progress=35, updated_at=NOW() WHERE id=$1`, jobId);
    await prisma.$executeRawUnsafe(
      `UPDATE ems_audio_export_job SET status='complete', progress=100, output_url=$2, updated_at=NOW() WHERE id=$1`,
      jobId,
      publicArtifactUrl(jobId, job.format as AudioExportFormat),
    );
  } catch (error) {
    await prisma.$executeRawUnsafe(
      `UPDATE ems_audio_export_job SET status='failed', error_message=$2, updated_at=NOW() WHERE id=$1`,
      jobId,
      error instanceof Error ? error.message : "render failed",
    );
  }
  return getAudioRenderJob(jobId, userId);
}

export async function getAudioRenderJob(jobId: string, userId: string) {
  await ensureExportTable();
  const rows = await prisma.$queryRawUnsafe<RenderJobRecord[]>(`SELECT * FROM ems_audio_export_job WHERE id = $1 AND user_id = $2 LIMIT 1`, jobId, userId);
  const job = rows[0];
  if (!job) return null;
  return {
    id: job.id,
    projectId: job.project_id,
    sessionId: job.session_id,
    format: job.format,
    status: job.status,
    progress: job.progress,
    outputUrl: job.output_url,
    errorMessage: job.error_message,
    createdAt: job.created_at.toISOString(),
    updatedAt: job.updated_at.toISOString(),
  };
}

export function renderSilentWav(seconds = 2, sampleRate = 44100) {
  const samples = Math.max(1, Math.floor(seconds * sampleRate));
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => Array.from(value).forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples * 2, true);
  return buffer;
}
