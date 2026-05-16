import { prisma } from "@/lib/prisma";

type StudioSnapshotPayload = {
  sessionId: string;
  roomId?: string;
  mode?: string;
  selectedTrack?: string;
  selectedClipId?: string | null;
  bpm?: number;
  bar?: number;
  playing?: boolean;
  tracks?: unknown[];
  clips?: unknown[];
  placedClips?: unknown[];
  audioBuffers?: unknown[];
  soundLibrary?: unknown[];
  padAssignments?: Record<string, unknown>;
  workspaceLayout?: unknown;
  selectedKit?: string | null;
  selectedInstrument?: string | null;
  metadata?: Record<string, unknown>;
};

type SnapshotRow = {
  id: string;
  session_id: string;
  room_id: string | null;
  payload: unknown;
  version: number;
  created_at: Date;
  updated_at: Date;
};

let initialized = false;

async function ensureSnapshotTable() {
  if (initialized) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ems_studio_session_snapshot (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE,
      room_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ems_studio_session_snapshot_version (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      room_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ems_studio_snapshot_room_updated_idx ON ems_studio_session_snapshot(room_id, updated_at DESC)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ems_studio_snapshot_version_session_idx ON ems_studio_session_snapshot_version(session_id, created_at DESC)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ems_studio_snapshot_version_room_idx ON ems_studio_session_snapshot_version(room_id, created_at DESC)`);
  initialized = true;
}

function safePayload(payload: StudioSnapshotPayload) {
  return {
    sessionId: payload.sessionId,
    roomId: payload.roomId ?? "ems-main-room",
    mode: payload.mode ?? "studio",
    selectedTrack: payload.selectedTrack ?? null,
    selectedClipId: payload.selectedClipId ?? null,
    bpm: typeof payload.bpm === "number" ? payload.bpm : null,
    bar: typeof payload.bar === "number" ? payload.bar : null,
    playing: Boolean(payload.playing),
    tracks: Array.isArray(payload.tracks) ? payload.tracks : [],
    clips: Array.isArray(payload.clips) ? payload.clips : [],
    placedClips: Array.isArray(payload.placedClips) ? payload.placedClips : [],
    audioBuffers: Array.isArray(payload.audioBuffers) ? payload.audioBuffers : [],
    soundLibrary: Array.isArray(payload.soundLibrary) ? payload.soundLibrary : [],
    padAssignments: payload.padAssignments && typeof payload.padAssignments === "object" ? payload.padAssignments : {},
    workspaceLayout: payload.workspaceLayout ?? null,
    selectedKit: payload.selectedKit ?? null,
    selectedInstrument: payload.selectedInstrument ?? null,
    metadata: payload.metadata ?? {},
    savedAt: new Date().toISOString(),
  };
}

function snapshotSummary(row: SnapshotRow) {
  const payload = row.payload as Record<string, unknown> | null;
  const placedClips = Array.isArray(payload?.placedClips) ? payload.placedClips.length : 0;
  const clips = Array.isArray(payload?.clips) ? payload.clips.length : 0;
  const soundLibrary = Array.isArray(payload?.soundLibrary) ? payload.soundLibrary.length : 0;
  const padAssignments = payload?.padAssignments && typeof payload.padAssignments === "object" ? Object.keys(payload.padAssignments).length : 0;
  return {
    id: row.id,
    sessionId: row.session_id,
    roomId: row.room_id,
    payload: row.payload,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    summary: {
      clipCount: clips + placedClips,
      placedClipCount: placedClips,
      soundCount: soundLibrary,
      padAssignmentCount: padAssignments,
    },
  };
}

export async function writeStudioSnapshot(payload: StudioSnapshotPayload) {
  if (!process.env.DATABASE_URL) return null;
  await ensureSnapshotTable();
  const sessionId = payload.sessionId;
  const roomId = payload.roomId ?? "ems-main-room";
  const snapshot = safePayload(payload);
  const id = `snapshot-${sessionId}`;
  const current = await readStudioSnapshot(sessionId);
  const nextVersion = (current?.version ?? 0) + 1;
  const versionId = `snapshot-${sessionId}-v${nextVersion}-${Date.now()}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO ems_studio_session_snapshot (id, session_id, room_id, payload, version)
     VALUES ($1, $2, $3, $4::jsonb, 1)
     ON CONFLICT (session_id) DO UPDATE SET
       room_id = EXCLUDED.room_id,
       payload = EXCLUDED.payload,
       version = ems_studio_session_snapshot.version + 1,
       updated_at = NOW()`,
    id,
    sessionId,
    roomId,
    JSON.stringify(snapshot),
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO ems_studio_session_snapshot_version (id, session_id, room_id, payload, version)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    versionId,
    sessionId,
    roomId,
    JSON.stringify(snapshot),
    nextVersion,
  );
  return readStudioSnapshot(sessionId);
}

export async function readStudioSnapshot(sessionId: string) {
  if (!process.env.DATABASE_URL) return null;
  await ensureSnapshotTable();
  const rows = await prisma.$queryRawUnsafe<SnapshotRow[]>(
    `SELECT * FROM ems_studio_session_snapshot WHERE session_id = $1 LIMIT 1`,
    sessionId,
  );
  const row = rows[0];
  if (!row) return null;
  return snapshotSummary(row);
}

export async function readStudioSnapshotById(snapshotId: string) {
  if (!process.env.DATABASE_URL) return null;
  await ensureSnapshotTable();
  const rows = await prisma.$queryRawUnsafe<SnapshotRow[]>(
    `SELECT id, session_id, room_id, payload, version, created_at, created_at AS updated_at
     FROM ems_studio_session_snapshot_version WHERE id = $1 LIMIT 1`,
    snapshotId,
  );
  const row = rows[0];
  if (!row) return null;
  return snapshotSummary(row);
}

export async function duplicateStudioSnapshot(snapshotId: string, newSessionId: string) {
  const source = await readStudioSnapshotById(snapshotId);
  if (!source) return null;
  const payload = source.payload as StudioSnapshotPayload;
  return writeStudioSnapshot({
    ...payload,
    sessionId: newSessionId,
    roomId: source.roomId ?? payload.roomId ?? "ems-main-room",
    metadata: {
      ...(payload.metadata ?? {}),
      duplicatedFromSnapshotId: snapshotId,
      duplicatedAt: new Date().toISOString(),
    },
  });
}

export async function listRecentStudioSnapshots(roomId = "ems-main-room", limit = 5) {
  if (!process.env.DATABASE_URL) return [];
  await ensureSnapshotTable();
  const rows = await prisma.$queryRawUnsafe<SnapshotRow[]>(
    `SELECT id, session_id, room_id, payload, version, created_at, created_at AS updated_at
     FROM ems_studio_session_snapshot_version WHERE room_id = $1 ORDER BY created_at DESC LIMIT $2`,
    roomId,
    limit,
  );
  if (rows.length) return rows.map(snapshotSummary);
  const fallbackRows = await prisma.$queryRawUnsafe<SnapshotRow[]>(
    `SELECT * FROM ems_studio_session_snapshot WHERE room_id = $1 ORDER BY updated_at DESC LIMIT $2`,
    roomId,
    limit,
  );
  return fallbackRows.map(snapshotSummary);
}
