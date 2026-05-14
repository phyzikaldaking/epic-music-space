export type CollabRole = "HOST" | "PRODUCER" | "ENGINEER" | "ARTIST" | "GUEST";
export type CollabPermission = "OWNER" | "EDIT" | "COMMENT" | "VIEW";

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
  tone: "cyan" | "pink" | "yellow" | "green";
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
  backend: "server-memory";
  updatedAt: string;
};

type MutableRoomState = Omit<CollabRoomState, "liveCount" | "editorCount" | "mutedCount" | "updatedAt">;

const defaultSeats: CollabSeat[] = [
  { id: "host", name: "Host", role: "HOST", permission: "OWNER", online: true, mic: true, cam: true, speaking: true, color: "#23f7ff" },
  { id: "producer", name: "Producer", role: "PRODUCER", permission: "EDIT", online: true, mic: true, cam: true, speaking: false, color: "#ff34d8" },
  { id: "engineer", name: "Engineer", role: "ENGINEER", permission: "EDIT", online: true, mic: true, cam: false, speaking: false, color: "#f5d94c" },
  { id: "artist", name: "Artist", role: "ARTIST", permission: "COMMENT", online: true, mic: false, cam: true, speaking: false, color: "#9b5cff" },
];

const defaultEvents: CollabEvent[] = [
  { id: "take", title: "Take armed", detail: "Lead Vox is ready for a punch-in pass.", createdAt: new Date().toISOString(), tone: "cyan" },
  { id: "mix", title: "Mix note pinned", detail: "Engineer requested tighter low-end on the 808 bus.", createdAt: new Date().toISOString(), tone: "yellow" },
  { id: "checkpoint", title: "Session checkpoint", detail: "Collab state checkpoint is ready.", createdAt: new Date().toISOString(), tone: "green" },
];

const globalForCollab = globalThis as unknown as { emsCollabRooms?: Map<string, MutableRoomState> };
const rooms = globalForCollab.emsCollabRooms ?? new Map<string, MutableRoomState>();
if (!globalForCollab.emsCollabRooms) globalForCollab.emsCollabRooms = rooms;

function seed(roomId: string): MutableRoomState {
  return {
    roomId,
    roomName: "EMS Main Studio",
    locked: false,
    recordApproval: true,
    exportApproval: true,
    screenShare: false,
    markerCount: 3,
    seats: defaultSeats,
    events: defaultEvents,
    backend: "server-memory",
  };
}

function compute(room: MutableRoomState): CollabRoomState {
  return {
    ...room,
    liveCount: room.seats.filter((seat) => seat.online).length,
    editorCount: room.seats.filter((seat) => seat.permission === "OWNER" || seat.permission === "EDIT").length,
    mutedCount: room.seats.filter((seat) => !seat.mic).length,
    updatedAt: new Date().toISOString(),
  };
}

export async function getCollabRoomState(roomId = "ems-main-room"): Promise<CollabRoomState> {
  if (!rooms.has(roomId)) rooms.set(roomId, seed(roomId));
  return compute(rooms.get(roomId)!);
}

export async function updateCollabRoomState(roomId: string, patch: Partial<MutableRoomState>, title = "Session update", detail = "Room state updated") {
  const current = rooms.get(roomId) ?? seed(roomId);
  const next: MutableRoomState = {
    ...current,
    ...patch,
    events: [
      { id: `event-${Date.now()}`, title, detail, createdAt: new Date().toISOString(), tone: "cyan" },
      ...(patch.events ?? current.events),
    ].slice(0, 10),
  };
  rooms.set(roomId, next);
  return compute(next);
}

export async function patchCollabSeat(roomId: string, seatId: string, patch: Partial<CollabSeat>) {
  const current = rooms.get(roomId) ?? seed(roomId);
  const nextSeats = current.seats.map((seat) => seat.id === seatId ? { ...seat, ...patch } : seat);
  rooms.set(roomId, { ...current, seats: nextSeats });
  return compute(rooms.get(roomId)!);
}
