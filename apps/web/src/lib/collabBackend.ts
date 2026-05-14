import { prisma } from "@ems/db";

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
  backend: "prisma" | "memory";
};

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

function summarize(roomId: string, roomName: string, seats: CollabSeat[], events: CollabEvent[], backend: "prisma" | "memory"): CollabRoomState {
  return {
    roomId,
    roomName,
    locked: false,
    recordApproval: true,
    exportApproval: true,
    screenShare: false,
    markerCount: events.filter((event) => event.title.toLowerCase().includes("marker")).length + 3,
    liveCount: seats.filter((seat) => seat.online).length,
    editorCount: seats.filter((seat) => seat.permission === "OWNER" || seat.permission === "EDIT").length,
    mutedCount: seats.filter((seat) => !seat.mic).length,
    seats,
    events,
    backend,
  };
}

export async function getCollabRoomState(roomId = "ems-main-room"): Promise<CollabRoomState> {
  try {
    const room = await prisma.room.findFirst({
      where: { id: roomId },
      include: {
        participants: { include: { user: true }, take: 8 },
        messages: { orderBy: { createdAt: "desc" }, take: 8 },
        timelineNotes: { orderBy: { createdAt: "desc" }, take: 8 },
      },
    });

    if (!room) return summarize(roomId, "EMS Main Studio", defaultSeats, defaultEvents, "memory");

    const seats: CollabSeat[] = room.participants.length
      ? room.participants.map((participant, index) => ({
          id: participant.id,
          name: participant.user?.name ?? participant.user?.username ?? `Seat ${index + 1}`,
          role: index === 0 ? "HOST" : "GUEST",
          permission: index === 0 ? "OWNER" : "COMMENT",
          online: true,
          mic: true,
          cam: index % 2 === 0,
          speaking: index === 0,
          color: ["#23f7ff", "#ff34d8", "#f5d94c", "#9b5cff"][index % 4]!,
        }))
      : defaultSeats;

    const events: CollabEvent[] = [
      ...room.timelineNotes.map((note, index) => ({ id: note.id, title: "Timeline note", detail: note.body, createdAt: note.createdAt.toISOString(), tone: index % 2 ? "pink" as const : "yellow" as const })),
      ...room.messages.map((message, index) => ({ id: message.id, title: "Room message", detail: message.body, createdAt: message.createdAt.toISOString(), tone: index % 2 ? "cyan" as const : "green" as const })),
    ].slice(0, 8);

    return summarize(room.id, room.title ?? "EMS Live Studio", seats, events.length ? events : defaultEvents, "prisma");
  } catch (error) {
    console.warn("[collab] falling back to memory state", error);
    return summarize(roomId, "EMS Main Studio", defaultSeats, defaultEvents, "memory");
  }
}

export async function appendCollabEvent(roomId: string, detail: string, title = "Session update") {
  try {
    await prisma.roomTimelineNote.create({
      data: {
        roomId,
        body: detail,
        authorId: "system",
      },
    });
  } catch (error) {
    console.warn("[collab] event append skipped", error);
  }
  return getCollabRoomState(roomId);
}
