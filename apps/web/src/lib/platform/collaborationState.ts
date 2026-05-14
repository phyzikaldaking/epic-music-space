export type StudioRole = "owner" | "producer" | "artist" | "engineer" | "guest" | "moderator";
export type PresenceStatus = "online" | "idle" | "reconnecting" | "offline";

export interface StudioPresence {
  userId: string;
  displayName: string;
  role: StudioRole;
  status: PresenceStatus;
  cursor?: { x: number; y: number; surface: "arrangement" | "mixer" | "browser" | "chat" };
  activeTool?: string;
  lastSeenAt: string;
}

export interface StudioTransportState {
  bpm: number;
  positionBeats: number;
  playing: boolean;
  startedAtAudioTime?: number;
  updatedAt: string;
  updatedBy: string;
}

export interface StudioOperation<TPayload = unknown> {
  id: string;
  sessionId: string;
  actorId: string;
  type: "pattern.update" | "mixer.update" | "clip.add" | "clip.remove" | "transport.update" | "asset.add" | "metadata.update";
  payload: TPayload;
  baseRevision: number;
  createdAt: string;
}

export interface StudioSessionState {
  sessionId: string;
  revision: number;
  ownerId: string;
  presence: StudioPresence[];
  transport: StudioTransportState;
  operations: StudioOperation[];
  updatedAt: string;
}

export function createInitialStudioSession(sessionId: string, ownerId: string): StudioSessionState {
  const now = new Date().toISOString();
  return {
    sessionId,
    revision: 0,
    ownerId,
    presence: [],
    transport: { bpm: 90, positionBeats: 0, playing: false, updatedAt: now, updatedBy: ownerId },
    operations: [],
    updatedAt: now,
  };
}

export function upsertPresence(state: StudioSessionState, presence: StudioPresence): StudioSessionState {
  const nextPresence = state.presence.filter((p) => p.userId !== presence.userId);
  nextPresence.push({ ...presence, lastSeenAt: new Date().toISOString() });
  return { ...state, presence: nextPresence, updatedAt: new Date().toISOString() };
}

export function applyOperation(state: StudioSessionState, operation: StudioOperation): StudioSessionState {
  if (operation.baseRevision > state.revision) {
    throw new Error("Operation base revision is ahead of authoritative state.");
  }
  const updatedAt = new Date().toISOString();
  return {
    ...state,
    revision: state.revision + 1,
    operations: [...state.operations.slice(-499), { ...operation, createdAt: operation.createdAt || updatedAt }],
    transport: operation.type === "transport.update"
      ? { ...state.transport, ...(operation.payload as Partial<StudioTransportState>), updatedAt, updatedBy: operation.actorId }
      : state.transport,
    updatedAt,
  };
}

export function pruneOfflinePresence(state: StudioSessionState, staleAfterMs = 45_000): StudioSessionState {
  const now = Date.now();
  return {
    ...state,
    presence: state.presence.map((p) => {
      const age = now - Date.parse(p.lastSeenAt);
      return age > staleAfterMs ? { ...p, status: "offline" } : p;
    }),
  };
}
