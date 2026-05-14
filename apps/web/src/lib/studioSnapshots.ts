import { prisma } from "@/lib/prisma";

type StudioSnapshotPayload = {
  sessionId: string;
  roomId?: string;
  mode?: string;
  selectedTrack?: string;
  bpm?: number;
  bar?: number;
  playing?: boolean;
  tracks?: unknown[];
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
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ems_studio_snapshot_room_updated_idx ON ems_studio_session_snapshot(room_id, updated_at DESC)`);
  initialized = true;
}

function safePayload(payload: StudioSnapshotPayload) {
  return {
    sessionId: payload.sessionId,
    roomId: payload.roomId ?? "ems-main-room",
    mode: payload.mode ?? "studio",
    selectedTrack: payload.selectedTrack ?? null,
    bpm: typeof payload.bpm === "number" ? payload.bpm : null,
    bar: typeof payload.bar === "number" ? payload.bar : null,
    playing: Boolean(payload.playing),
    tracks: Array.isArray(payload.tracks) ? payload.tracks : [],
    metadata: payload.metadata ?? {},
    savedAt: new Date().toISOString(),
  };
}

export async function writeStudioSnapshot(payload: StudioSnapshotPayload) {
  if (!process.env.DATABASE_URL) return null;
  await ensureSnapshotTable();
  const sessionId = payload.sessionId;
  const roomId = payload.roomId ?? "ems-main-room";
  const snapshot = safePayload(payload);
  const id = `snapshot-${sessionId}`;
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
  return {
    id: row.id,
    sessionId: row.session_id,
    roomId: row.room_id,
    payload: row.payload,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listRecentStudioSnapshots(roomId = "ems-main-room", limit = 5) {
  if (!process.env.DATABASE_URL) return [];
  await ensureSnapshotTable();
  const rows = await prisma.$queryRawUnsafe<SnapshotRow[]>(
    `SELECT * FROM ems_studio_session_snapshot WHERE room_id = $1 ORDER BY updated_at DESC LIMIT $2`,
    roomId,
    limit,
  );
  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    roomId: row.room_id,
    payload: row.payload,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}
