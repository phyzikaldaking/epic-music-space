import { prisma } from "@/lib/prisma";

type StudioOperation = {
  id?: string;
  sessionId: string;
  projectId?: string;
  actorId?: string;
  clientId?: string;
  baseRevision?: number;
  type: string;
  target?: string;
  payload?: Record<string, unknown>;
};

type StudioStateRow = {
  session_id: string;
  project_id: string | null;
  state: unknown;
  revision: number;
  vector_clock: unknown;
  updated_at: Date;
};

type StudioOperationRow = {
  id: string;
  session_id: string;
  project_id: string | null;
  actor_id: string | null;
  client_id: string | null;
  base_revision: number;
  resulting_revision: number;
  type: string;
  target: string | null;
  payload: unknown;
  conflict: boolean;
  created_at: Date;
};

let initialized = false;

async function ensureRealtimeTables() {
  if (initialized) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ems_studio_realtime_state (
      session_id TEXT PRIMARY KEY,
      project_id TEXT,
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      revision INTEGER NOT NULL DEFAULT 0,
      vector_clock JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ems_studio_operation_log (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      project_id TEXT,
      actor_id TEXT,
      client_id TEXT,
      base_revision INTEGER NOT NULL DEFAULT 0,
      resulting_revision INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL,
      target TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      conflict BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ems_studio_operation_session_revision_idx ON ems_studio_operation_log(session_id, resulting_revision DESC)`);
  initialized = true;
}

function emptyState(sessionId: string, projectId?: string) {
  return {
    sessionId,
    projectId: projectId ?? "ems-default-project",
    tracks: [],
    transport: { bpm: 92, bar: 1, playing: false },
    selectedTrack: null,
    updatedAt: new Date().toISOString(),
  };
}

function objectState(value: unknown, sessionId: string, projectId?: string): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : emptyState(sessionId, projectId);
}

function applyOperation(state: Record<string, unknown>, op: StudioOperation) {
  const next = { ...state, updatedAt: new Date().toISOString() };
  if (op.type === "state.patch") return { ...next, ...(op.payload ?? {}) };
  if (op.type === "track.upsert" && op.payload) {
    const tracks = Array.isArray(next.tracks) ? [...next.tracks] as Record<string, unknown>[] : [];
    const id = String(op.payload.id ?? op.target ?? `track-${Date.now()}`);
    const index = tracks.findIndex((track) => String(track.id) === id);
    const track = { ...(index >= 0 ? tracks[index] : {}), ...op.payload, id };
    if (index >= 0) tracks[index] = track; else tracks.push(track);
    return { ...next, tracks };
  }
  if (op.type === "track.delete") {
    const tracks = Array.isArray(next.tracks) ? next.tracks.filter((track) => String((track as Record<string, unknown>).id) !== op.target) : [];
    return { ...next, tracks };
  }
  if (op.type === "transport.patch") return { ...next, transport: { ...(next.transport as Record<string, unknown> | undefined), ...(op.payload ?? {}) } };
  if (op.type === "selection.set") return { ...next, selectedTrack: op.target ?? op.payload?.selectedTrack ?? null };
  return { ...next, lastOperation: op };
}

function incrementVectorClock(clock: unknown, clientId?: string | null) {
  const key = clientId || "server";
  const next = clock && typeof clock === "object" && !Array.isArray(clock) ? { ...(clock as Record<string, number>) } : {};
  next[key] = Number(next[key] ?? 0) + 1;
  return next;
}

export async function readStudioRealtimeState(sessionId: string, projectId = "ems-default-project") {
  if (!process.env.DATABASE_URL) return { state: emptyState(sessionId, projectId), revision: 0, vectorClock: {}, backend: "memory-fallback" };
  await ensureRealtimeTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO ems_studio_realtime_state (session_id, project_id, state, revision, vector_clock)
     VALUES ($1, $2, $3::jsonb, 0, '{}'::jsonb)
     ON CONFLICT (session_id) DO NOTHING`,
    sessionId,
    projectId,
    JSON.stringify(emptyState(sessionId, projectId)),
  );
  const rows = await prisma.$queryRawUnsafe<StudioStateRow[]>(`SELECT * FROM ems_studio_realtime_state WHERE session_id = $1 LIMIT 1`, sessionId);
  const row = rows[0];
  return { state: objectState(row?.state, sessionId, projectId), revision: row?.revision ?? 0, vectorClock: row?.vector_clock ?? {}, backend: "database" };
}

export async function appendStudioOperation(operation: StudioOperation) {
  if (!process.env.DATABASE_URL) return { ...await readStudioRealtimeState(operation.sessionId, operation.projectId), conflict: false, operationId: operation.id ?? `op-${Date.now()}` };
  await ensureRealtimeTables();
  const current = await readStudioRealtimeState(operation.sessionId, operation.projectId);
  const currentRevision = current.revision;
  const baseRevision = Number(operation.baseRevision ?? currentRevision);
  const conflict = baseRevision < currentRevision;
  const nextRevision = currentRevision + 1;
  const nextState = applyOperation(current.state, operation);
  const nextClock = incrementVectorClock(current.vectorClock, operation.clientId);
  const operationId = operation.id ?? `op-${Date.now()}-${crypto.randomUUID()}`;
  await prisma.$transaction([
    prisma.$executeRawUnsafe(
      `UPDATE ems_studio_realtime_state SET state = $2::jsonb, revision = $3, vector_clock = $4::jsonb, project_id = $5, updated_at = NOW() WHERE session_id = $1`,
      operation.sessionId,
      JSON.stringify(nextState),
      nextRevision,
      JSON.stringify(nextClock),
      operation.projectId ?? "ems-default-project",
    ),
    prisma.$executeRawUnsafe(
      `INSERT INTO ems_studio_operation_log (id, session_id, project_id, actor_id, client_id, base_revision, resulting_revision, type, target, payload, conflict)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
      operationId,
      operation.sessionId,
      operation.projectId ?? "ems-default-project",
      operation.actorId ?? null,
      operation.clientId ?? null,
      baseRevision,
      nextRevision,
      operation.type,
      operation.target ?? null,
      JSON.stringify(operation.payload ?? {}),
      conflict,
    ),
  ]);
  return { state: nextState, revision: nextRevision, vectorClock: nextClock, conflict, operationId, backend: "database" };
}

export async function listStudioOperations(sessionId: string, afterRevision = 0, limit = 100) {
  if (!process.env.DATABASE_URL) return [];
  await ensureRealtimeTables();
  const rows = await prisma.$queryRawUnsafe<StudioOperationRow[]>(
    `SELECT * FROM ems_studio_operation_log WHERE session_id = $1 AND resulting_revision > $2 ORDER BY resulting_revision ASC LIMIT $3`,
    sessionId,
    afterRevision,
    limit,
  );
  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    projectId: row.project_id,
    actorId: row.actor_id,
    clientId: row.client_id,
    baseRevision: row.base_revision,
    resultingRevision: row.resulting_revision,
    type: row.type,
    target: row.target,
    payload: row.payload,
    conflict: row.conflict,
    createdAt: row.created_at.toISOString(),
  }));
}
