import { prisma } from "@/lib/prisma";

type BeatPatternPayload = {
  id?: string;
  projectId: string;
  sessionId?: string;
  name: string;
  bpm: number;
  swing: number;
  tracks: unknown[];
  arrangement?: unknown[];
};

type BeatPatternRow = {
  id: string;
  project_id: string;
  session_id: string | null;
  name: string;
  bpm: number;
  swing: number;
  tracks: unknown;
  arrangement: unknown;
  created_at: Date;
  updated_at: Date;
};

let initialized = false;

async function ensureBeatPatternTable() {
  if (initialized) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ems_beat_pattern (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT,
      name TEXT NOT NULL,
      bpm INTEGER NOT NULL DEFAULT 92,
      swing INTEGER NOT NULL DEFAULT 0,
      tracks JSONB NOT NULL DEFAULT '[]'::jsonb,
      arrangement JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ems_beat_pattern_project_updated_idx ON ems_beat_pattern(project_id, updated_at DESC)`);
  initialized = true;
}

function mapPattern(row: BeatPatternRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id,
    name: row.name,
    bpm: row.bpm,
    swing: row.swing,
    tracks: Array.isArray(row.tracks) ? row.tracks : [],
    arrangement: Array.isArray(row.arrangement) ? row.arrangement : [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function saveBeatPattern(payload: BeatPatternPayload) {
  await ensureBeatPatternTable();
  const id = payload.id ?? `beat-pattern-${Date.now()}-${crypto.randomUUID()}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO ems_beat_pattern (id, project_id, session_id, name, bpm, swing, tracks, arrangement)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       bpm = EXCLUDED.bpm,
       swing = EXCLUDED.swing,
       tracks = EXCLUDED.tracks,
       arrangement = EXCLUDED.arrangement,
       updated_at = NOW()`,
    id,
    payload.projectId,
    payload.sessionId ?? null,
    payload.name,
    payload.bpm,
    payload.swing,
    JSON.stringify(payload.tracks ?? []),
    JSON.stringify(payload.arrangement ?? []),
  );
  return getBeatPattern(id, payload.projectId);
}

export async function getBeatPattern(id: string, projectId: string) {
  await ensureBeatPatternTable();
  const rows = await prisma.$queryRawUnsafe<BeatPatternRow[]>(`SELECT * FROM ems_beat_pattern WHERE id = $1 AND project_id = $2 LIMIT 1`, id, projectId);
  return rows[0] ? mapPattern(rows[0]) : null;
}

export async function listBeatPatterns(projectId: string, limit = 25) {
  await ensureBeatPatternTable();
  const rows = await prisma.$queryRawUnsafe<BeatPatternRow[]>(`SELECT * FROM ems_beat_pattern WHERE project_id = $1 ORDER BY updated_at DESC LIMIT $2`, projectId, limit);
  return rows.map(mapPattern);
}

export async function deleteBeatPattern(id: string, projectId: string) {
  await ensureBeatPatternTable();
  await prisma.$executeRawUnsafe(`DELETE FROM ems_beat_pattern WHERE id = $1 AND project_id = $2`, id, projectId);
  return { id, deleted: true };
}
