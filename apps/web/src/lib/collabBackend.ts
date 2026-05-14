import { prisma } from "@/lib/prisma";

export type CollabRole = "HOST" | "PRODUCER" | "ENGINEER" | "ARTIST" | "GUEST";
export type CollabPermission = "OWNER" | "EDIT" | "COMMENT" | "VIEW";
export type CollabTone = "cyan" | "pink" | "yellow" | "green";

export type CollabSeat = {
  id: string;
  name: string;
  role: CollabRole;
  permission: CollabPermission;
  online: boolean;
  mic: boolean;
  cam: boolean;
  speaking: boolean;
  color: string;
};

export type CollabEvent = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  tone: CollabTone;
};

export type CollabRoomState = {
  roomId: string;
  roomName: string;
  locked: boolean;
  recordApproval: boolean;
  exportApproval: boolean;
  screenShare: boolean;
  markerCount: number;
  liveCount: number;
  editorCount: number;
  mutedCount: number;
  seats: CollabSeat[];
  events: CollabEvent[];
  backend: "prisma" | "server-memory";
  updatedAt: string;
};

type MutableRoomState = Omit<CollabRoomState, "liveCount" | "editorCount" | "mutedCount" | "updatedAt">;
type RoomMeta = { locked?: boolean; recordApproval?: boolean; exportApproval?: boolean; screenShare?: boolean; markerCount?: number; seats?: CollabSeat[] };

const defaultSeats: CollabSeat[] = [
  { id: "host", name: "Host", role: "HOST", permission: "OWNER", online: true, mic: true, cam: true, speaking: true, color: "#23f7ff" },
  { id: "producer", name: "Producer", role: "PRODUCER", permission: "EDIT", online: true, mic: true, cam: true, speaking: false, color: "#ff34d8" },
  { id: "engineer", name: "Engineer", role: "ENGINEER", permission: "EDIT", online: true, mic: true, cam: false, speaking: false, color: "#f5d94c" },
  { id: "artist", name: "Artist", role: "ARTIST", permission: "COMMENT", online: true, mic: false, cam: true, speaking: false, color: "#9b5cff" },
];

const now = () => new Date().toISOString();
const defaultEvents: CollabEvent[] = [
  { id: "take", title: "Take armed", detail: "Lead Vox is ready for a punch-in pass.", createdAt: now(), tone: "cyan" },
  { id: "mix", title: "Mix note pinned", detail: "Engineer requested tighter low-end on the 808 bus.", createdAt: now(), tone: "yellow" },
  { id: "checkpoint", title: "Session checkpoint", detail: "Collab state checkpoint is ready.", createdAt: now(), tone: "green" },
];

const globalForCollab = globalThis as unknown as { emsCollabRooms?: Map<string, MutableRoomState> };
const rooms = globalForCollab.emsCollabRooms ?? new Map<string, MutableRoomState>();
if (!globalForCollab.emsCollabRooms) globalForCollab.emsCollabRooms = rooms;

function seed(roomId: string): MutableRoomState {
  return { roomId, roomName: "EMS Main Studio", locked: false, recordApproval: true, exportApproval: true, screenShare: false, markerCount: 3, seats: defaultSeats, events: defaultEvents, backend: "server-memory" };
}

function compute(room: MutableRoomState): CollabRoomState {
  return { ...room, liveCount: room.seats.filter((seat) => seat.online).length, editorCount: room.seats.filter((seat) => seat.permission === "OWNER" || seat.permission === "EDIT").length, mutedCount: room.seats.filter((seat) => !seat.mic).length, updatedAt: now() };
}

function metaFromDescription(description?: string | null): RoomMeta {
  const marker = "EMS_COLLAB_META:";
  const start = description?.indexOf(marker) ?? -1;
  if (!description || start < 0) return {};
  try { return JSON.parse(description.slice(start + marker.length)) as RoomMeta; } catch { return {}; }
}

function descriptionFromMeta(meta: RoomMeta) { return `EMS_COLLAB_META:${JSON.stringify(meta)}`; }

async function getSystemUserId() {
  const email = process.env.EMS_SYSTEM_USER_EMAIL ?? "system@epicmusicspace.local";
  const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email, name: "EMS System", username: "ems-system" }, select: { id: true } });
  return user.id;
}

async function getPrismaRoom(roomId: string) {
  const systemUserId = await getSystemUserId();
  return prisma.room.upsert({
    where: { id: roomId },
    update: {},
    create: { id: roomId, hostId: systemUserId, title: "EMS Main Studio", description: descriptionFromMeta({ locked: false, recordApproval: true, exportApproval: true, screenShare: false, markerCount: 3, seats: defaultSeats }), maxCapacity: 8 },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
}

function stateFromPrismaRoom(room: Awaited<ReturnType<typeof getPrismaRoom>>): CollabRoomState {
  const meta = metaFromDescription(room.description);
  const seats = meta.seats?.length ? meta.seats : defaultSeats;
  const events: CollabEvent[] = room.messages.length ? room.messages.map((message) => ({ id: message.id, title: "Session update", detail: message.body, createdAt: message.createdAt.toISOString(), tone: "cyan" as const })) : defaultEvents;
  return compute({ roomId: room.id, roomName: room.title, locked: meta.locked ?? false, recordApproval: meta.recordApproval ?? true, exportApproval: meta.exportApproval ?? true, screenShare: meta.screenShare ?? false, markerCount: meta.markerCount ?? 3, seats, events, backend: "prisma" });
}

export async function getCollabRoomState(roomId = "ems-main-room"): Promise<CollabRoomState> {
  if (process.env.DATABASE_URL) {
    try { return stateFromPrismaRoom(await getPrismaRoom(roomId)); } catch (error) { console.warn("[collab] prisma state failed, falling back to memory", error); }
  }
  if (!rooms.has(roomId)) rooms.set(roomId, seed(roomId));
  return compute(rooms.get(roomId)!);
}

export async function updateCollabRoomState(roomId: string, patch: Partial<MutableRoomState>, title = "Session update", detail = "Room state updated") {
  if (process.env.DATABASE_URL) {
    try {
      const room = await getPrismaRoom(roomId);
      const currentMeta = metaFromDescription(room.description);
      const nextMeta: RoomMeta = { ...currentMeta, locked: patch.locked ?? currentMeta.locked ?? false, recordApproval: patch.recordApproval ?? currentMeta.recordApproval ?? true, exportApproval: patch.exportApproval ?? currentMeta.exportApproval ?? true, screenShare: patch.screenShare ?? currentMeta.screenShare ?? false, markerCount: patch.markerCount ?? currentMeta.markerCount ?? 3, seats: patch.seats ?? currentMeta.seats ?? defaultSeats };
      const systemUserId = await getSystemUserId();
      await prisma.$transaction([
        prisma.room.update({ where: { id: roomId }, data: { description: descriptionFromMeta(nextMeta), title: patch.roomName ?? room.title } }),
        prisma.roomMessage.create({ data: { roomId, userId: systemUserId, body: `${title}: ${detail}` } }),
      ]);
      return stateFromPrismaRoom(await getPrismaRoom(roomId));
    } catch (error) { console.warn("[collab] prisma update failed, falling back to memory", error); }
  }
  const current = rooms.get(roomId) ?? seed(roomId);
  const event: CollabEvent = { id: `event-${Date.now()}`, title, detail, createdAt: now(), tone: "cyan" };
  const next: MutableRoomState = { ...current, ...patch, events: [event, ...(patch.events ?? current.events)].slice(0, 10) };
  rooms.set(roomId, next);
  return compute(next);
}

export async function patchCollabSeat(roomId: string, seatId: string, patch: Partial<CollabSeat>) {
  const current = await getCollabRoomState(roomId);
  const nextSeats = current.seats.map((seat) => seat.id === seatId ? { ...seat, ...patch } : seat);
  return updateCollabRoomState(roomId, { seats: nextSeats }, "Seat updated", `${seatId} permissions or device state changed`);
}
