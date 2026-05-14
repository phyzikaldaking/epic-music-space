import { prisma } from "@/lib/prisma";
import type { CollabEvent, CollabRoomState, CollabSeat } from "@/lib/collabBackend";

type CollabStatePatch = {
  roomName?: string;
  locked?: boolean;
  recordApproval?: boolean;
  exportApproval?: boolean;
  screenShare?: boolean;
  markerCount?: number;
  seats?: CollabSeat[];
  events?: CollabEvent[];
};

type DurableRow = {
  room_id: string;
  room_name: string;
  locked: boolean;
  record_approval: boolean;
  export_approval: boolean;
  screen_share: boolean;
  marker_count: number;
  seats: unknown;
  events: unknown;
  updated_at: Date;
};

let initialized = false;

async function ensureDurableTables() {
  if (initialized) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ems_collab_room_state (
      room_id TEXT PRIMARY KEY,
      room_name TEXT NOT NULL DEFAULT 'EMS Main Studio',
      locked BOOLEAN NOT NULL DEFAULT FALSE,
      record_approval BOOLEAN NOT NULL DEFAULT TRUE,
      export_approval BOOLEAN NOT NULL DEFAULT TRUE,
      screen_share BOOLEAN NOT NULL DEFAULT FALSE,
      marker_count INTEGER NOT NULL DEFAULT 0,
      seats JSONB NOT NULL DEFAULT '[]'::jsonb,
      events JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ems_collab_audit_log (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      actor TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ems_collab_audit_room_created_idx ON ems_collab_audit_log(room_id, created_at DESC)`);
  initialized = true;
}

function compute(row: DurableRow): CollabRoomState {
  const seats = Array.isArray(row.seats) ? row.seats as CollabSeat[] : [];
  const events = Array.isArray(row.events) ? row.events as CollabEvent[] : [];
  return {
    roomId: row.room_id,
    roomName: row.room_name,
    locked: row.locked,
    recordApproval: row.record_approval,
    exportApproval: row.export_approval,
    screenShare: row.screen_share,
    markerCount: row.marker_count,
    liveCount: seats.filter((seat) => seat.online).length,
    editorCount: seats.filter((seat) => seat.permission === "OWNER" || seat.permission === "EDIT").length,
    mutedCount: seats.filter((seat) => !seat.mic).length,
    seats,
    events,
    backend: "prisma",
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function readDurableCollabState(roomId: string, seed: Omit<CollabRoomState, "liveCount" | "editorCount" | "mutedCount" | "updatedAt" | "backend">) {
  if (!process.env.DATABASE_URL) return null;
  await ensureDurableTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO ems_collab_room_state (room_id, room_name, locked, record_approval, export_approval, screen_share, marker_count, seats, events)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
     ON CONFLICT (room_id) DO NOTHING`,
    roomId,
    seed.roomName,
    seed.locked,
    seed.recordApproval,
    seed.exportApproval,
    seed.screenShare,
    seed.markerCount,
    JSON.stringify(seed.seats),
    JSON.stringify(seed.events),
  );
  const rows = await prisma.$queryRawUnsafe<DurableRow[]>(`SELECT * FROM ems_collab_room_state WHERE room_id = $1 LIMIT 1`, roomId);
  return rows[0] ? compute(rows[0]) : null;
}

export async function writeDurableCollabState(roomId: string, current: CollabRoomState, patch: CollabStatePatch, audit: { action: string; detail: string; actor?: string; metadata?: Record<string, unknown> }) {
  if (!process.env.DATABASE_URL) return null;
  await ensureDurableTables();
  const next = {
    roomName: patch.roomName ?? current.roomName,
    locked: patch.locked ?? current.locked,
    recordApproval: patch.recordApproval ?? current.recordApproval,
    exportApproval: patch.exportApproval ?? current.exportApproval,
    screenShare: patch.screenShare ?? current.screenShare,
    markerCount: patch.markerCount ?? current.markerCount,
    seats: patch.seats ?? current.seats,
    events: patch.events ?? current.events,
  };
  const auditId = `audit-${Date.now()}-${crypto.randomUUID()}`;
  await prisma.$transaction([
    prisma.$executeRawUnsafe(
      `INSERT INTO ems_collab_room_state (room_id, room_name, locked, record_approval, export_approval, screen_share, marker_count, seats, events)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
       ON CONFLICT (room_id) DO UPDATE SET
         room_name = EXCLUDED.room_name,
         locked = EXCLUDED.locked,
         record_approval = EXCLUDED.record_approval,
         export_approval = EXCLUDED.export_approval,
         screen_share = EXCLUDED.screen_share,
         marker_count = EXCLUDED.marker_count,
         seats = EXCLUDED.seats,
         events = EXCLUDED.events,
         updated_at = NOW()`,
      roomId,
      next.roomName,
      next.locked,
      next.recordApproval,
      next.exportApproval,
      next.screenShare,
      next.markerCount,
      JSON.stringify(next.seats),
      JSON.stringify(next.events),
    ),
    prisma.$executeRawUnsafe(
      `INSERT INTO ems_collab_audit_log (id, room_id, action, detail, actor, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      auditId,
      roomId,
      audit.action,
      audit.detail,
      audit.actor ?? null,
      JSON.stringify(audit.metadata ?? {}),
    ),
  ]);
  const rows = await prisma.$queryRawUnsafe<DurableRow[]>(`SELECT * FROM ems_collab_room_state WHERE room_id = $1 LIMIT 1`, roomId);
  return rows[0] ? compute(rows[0]) : null;
}

export async function readDurableCollabAudit(roomId: string, limit = 50) {
  if (!process.env.DATABASE_URL) return [];
  await ensureDurableTables();
  return prisma.$queryRawUnsafe<Array<{ id: string; room_id: string; action: string; detail: string; actor: string | null; metadata: unknown; created_at: Date }>>(
    `SELECT * FROM ems_collab_audit_log WHERE room_id = $1 ORDER BY created_at DESC LIMIT $2`,
    roomId,
    limit,
  );
}
