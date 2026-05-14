import { prisma } from "@/lib/prisma";
import { listBeatPatterns } from "@/lib/beatPatternStore";

export type AudioExportFormat = "full_mix" | "stems" | "preview" | "license_package";

type RenderInput = { userId: string; projectId: string; sessionId: string; format: AudioExportFormat };
type RenderJobRecord = { id: string; user_id: string; project_id: string; session_id: string; format: string; status: string; progress: number; output_url: string | null; error_message: string | null; render_manifest: unknown; created_at: Date; updated_at: Date };
type BeatTrack = { id?: string; name?: string; padKind?: string; kind?: string; level?: number; muted?: boolean; pattern?: boolean[] };

let initialized = false;
let artifactsInitialized = false;

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

async function ensureArtifactTable() {
  if (artifactsInitialized) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ems_audio_export_artifact (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      format TEXT NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ems_audio_export_artifact_job_idx ON ems_audio_export_artifact(job_id, user_id)`);
  artifactsInitialized = true;
}

function publicArtifactUrl(jobId: string, format: AudioExportFormat) {
  const ext = format === "license_package" ? "json" : "wav";
  return `/api/studio/export/artifact?jobId=${encodeURIComponent(jobId)}&format=${encodeURIComponent(format)}&ext=${ext}`;
}

function writeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => Array.from(value).forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
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
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  samples.forEach((sample) => { const clipped = Math.max(-1, Math.min(1, sample)); view.setInt16(offset, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true); offset += 2; });
  return Buffer.from(buffer);
}

function padFrequency(track: BeatTrack, index: number) {
  const pad = String(track.padKind ?? track.kind ?? "tone");
  if (pad.includes("kick")) return 56;
  if (pad.includes("808") || pad.includes("bass")) return 44;
  if (pad.includes("snare") || pad.includes("clap")) return 185;
  if (pad.includes("hat")) return 6200;
  if (pad.includes("crash")) return 3100;
  return 220 + index * 55;
}

function renderTracksToWav(tracks: BeatTrack[], bpm = 92, swing = 12, stemTrackId?: string) {
  const sampleRate = 44100;
  const stepDuration = 60 / bpm / 4;
  const totalSamples = Math.ceil(stepDuration * 16 * sampleRate);
  const samples = new Float32Array(totalSamples);
  tracks.forEach((track, trackIndex) => {
    if (stemTrackId && String(track.id ?? track.name) !== stemTrackId) return;
    if (track.muted || !Array.isArray(track.pattern)) return;
    const level = Math.max(0, Math.min(1, Number(track.level ?? 75) / 100));
    track.pattern.forEach((enabled, stepIndex) => {
      if (!enabled) return;
      const swung = stepIndex % 2 === 1 ? (swing / 100) * stepDuration * 0.5 : 0;
      const start = Math.floor((stepIndex * stepDuration + swung) * sampleRate);
      const isBass = String(track.padKind ?? track.kind).includes("808") || String(track.kind).includes("bass");
      const length = Math.floor((isBass ? 0.38 : 0.13) * sampleRate);
      const freq = padFrequency(track, trackIndex);
      for (let i = 0; i < length && start + i < samples.length; i += 1) {
        const t = i / sampleRate;
        const env = Math.exp(-t * (isBass ? 5 : 24));
        const tone = Math.sin(2 * Math.PI * Math.max(35, freq - (String(track.padKind).includes("kick") ? t * 90 : 0)) * t) * env * level * 0.26;
        const noise = (Math.sin((i + 1) * 12.9898 + trackIndex * 78.233) * 43758.5453 % 1) * env * (String(track.padKind).includes("hat") || String(track.padKind).includes("snare") || String(track.padKind).includes("clap") ? 0.11 : 0.018);
        samples[start + i] += tone + noise;
      }
    });
  });
  return writeWav(samples, sampleRate);
}

async function collectRenderState(projectId: string) {
  const patterns = await listBeatPatterns(projectId, 1).catch(() => []);
  const pattern = patterns[0] as { tracks?: BeatTrack[]; bpm?: number; swing?: number; name?: string; arrangement?: unknown[] } | undefined;
  return {
    name: pattern?.name ?? "EMS Default Beat",
    bpm: Number(pattern?.bpm ?? 92),
    swing: Number(pattern?.swing ?? 12),
    tracks: Array.isArray(pattern?.tracks) ? pattern.tracks : [
      { id: "kick", name: "Kick", padKind: "kick", level: 90, pattern: [true,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false] },
      { id: "snare", name: "Snare", padKind: "snare", level: 75, pattern: [false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false] },
      { id: "hat", name: "Hat", padKind: "hat", level: 58, pattern: Array.from({ length: 16 }, (_, i) => i % 2 === 0) },
      { id: "bass", name: "808", padKind: "bass808", kind: "bass", level: 82, pattern: [true,false,false,true,false,false,false,false,true,false,false,true,false,false,true,false] },
    ],
    arrangement: pattern?.arrangement ?? [],
  };
}

async function saveArtifact(job: RenderJobRecord, filename: string, mimeType: string, data: Buffer) {
  await ensureArtifactTable();
  const id = `artifact-${Date.now()}-${crypto.randomUUID()}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO ems_audio_export_artifact (id, job_id, user_id, project_id, filename, mime_type, format, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    id,
    job.id,
    job.user_id,
    job.project_id,
    filename,
    mimeType,
    job.format,
    data,
  );
  return id;
}

export async function createAudioRenderJob(input: RenderInput) {
  await ensureExportTable();
  const id = `audio-export-${Date.now()}-${crypto.randomUUID()}`;
  const manifest = { projectId: input.projectId, sessionId: input.sessionId, format: input.format, stages: ["queued", "collect_project_state", "render_audio", "package_artifacts", "complete"], queuedAt: new Date().toISOString() };
  await prisma.$executeRawUnsafe(`INSERT INTO ems_audio_export_job (id, user_id, project_id, session_id, format, status, progress, render_manifest) VALUES ($1,$2,$3,$4,$5,'queued',5,$6::jsonb)`, id, input.userId, input.projectId, input.sessionId, input.format, JSON.stringify(manifest));
  return runAudioRenderJob(id, input.userId);
}

export async function runAudioRenderJob(jobId: string, userId: string) {
  await ensureExportTable();
  const rows = await prisma.$queryRawUnsafe<RenderJobRecord[]>(`SELECT * FROM ems_audio_export_job WHERE id = $1 AND user_id = $2 LIMIT 1`, jobId, userId);
  const job = rows[0];
  if (!job) return null;
  try {
    await prisma.$executeRawUnsafe(`UPDATE ems_audio_export_job SET status='collecting', progress=25, updated_at=NOW() WHERE id=$1`, jobId);
    const state = await collectRenderState(job.project_id);
    await prisma.$executeRawUnsafe(`UPDATE ems_audio_export_job SET status='rendering', progress=55, updated_at=NOW() WHERE id=$1`, jobId);
    if (job.format === "stems") {
      for (const track of state.tracks) await saveArtifact(job, `${String(track.name ?? track.id ?? "stem").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-stem.wav`, "audio/wav", renderTracksToWav(state.tracks, state.bpm, state.swing, String(track.id ?? track.name)));
    } else if (job.format === "license_package") {
      const data = Buffer.from(JSON.stringify({ projectId: job.project_id, sessionId: job.session_id, pattern: state.name, bpm: state.bpm, swing: state.swing, tracks: state.tracks.map((track) => ({ id: track.id, name: track.name, kind: track.kind, padKind: track.padKind })), arrangement: state.arrangement, generatedAt: new Date().toISOString() }, null, 2));
      await saveArtifact(job, "license-package-manifest.json", "application/json", data);
    } else {
      await saveArtifact(job, `${job.format}.wav`, "audio/wav", renderTracksToWav(state.tracks, state.bpm, state.swing));
    }
    await prisma.$executeRawUnsafe(`UPDATE ems_audio_export_job SET status='complete', progress=100, output_url=$2, render_manifest=$3::jsonb, updated_at=NOW() WHERE id=$1`, jobId, publicArtifactUrl(jobId, job.format as AudioExportFormat), JSON.stringify({ ...state, completedAt: new Date().toISOString() }));
  } catch (error) {
    await prisma.$executeRawUnsafe(`UPDATE ems_audio_export_job SET status='failed', error_message=$2, updated_at=NOW() WHERE id=$1`, jobId, error instanceof Error ? error.message : "render failed");
  }
  return getAudioRenderJob(jobId, userId);
}

export async function getAudioRenderJob(jobId: string, userId: string) {
  await ensureExportTable();
  const rows = await prisma.$queryRawUnsafe<RenderJobRecord[]>(`SELECT * FROM ems_audio_export_job WHERE id = $1 AND user_id = $2 LIMIT 1`, jobId, userId);
  const job = rows[0];
  if (!job) return null;
  return { id: job.id, projectId: job.project_id, sessionId: job.session_id, format: job.format, status: job.status, progress: job.progress, outputUrl: job.output_url, errorMessage: job.error_message, createdAt: job.created_at.toISOString(), updatedAt: job.updated_at.toISOString() };
}

export async function getAudioExportArtifact(jobId: string, userId: string) {
  await ensureArtifactTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ filename: string; mime_type: string; data: Buffer }>>(`SELECT filename, mime_type, data FROM ems_audio_export_artifact WHERE job_id = $1 AND user_id = $2 ORDER BY created_at ASC LIMIT 1`, jobId, userId);
  return rows[0] ? { filename: rows[0].filename, mimeType: rows[0].mime_type, data: rows[0].data } : null;
}
