import type { StudioOperation, StudioPresence, StudioSessionState } from "./collaborationState";

export type RealtimeTransportKind = "websocket" | "supabase_realtime" | "livekit_data" | "local_fallback";
export type RealtimeEventType = "presence" | "operation" | "snapshot" | "ack" | "heartbeat" | "reconnect";

export interface RealtimeEnvelope<TPayload = unknown> {
  id: string;
  sessionId: string;
  type: RealtimeEventType;
  payload: TPayload;
  revision?: number;
  actorId: string;
  sentAt: string;
}

export interface RealtimeAdapter {
  kind: RealtimeTransportKind;
  connect(sessionId: string, actorId: string): Promise<void>;
  disconnect(): Promise<void>;
  publish<TPayload>(event: RealtimeEnvelope<TPayload>): Promise<void>;
  subscribe(handler: (event: RealtimeEnvelope) => void): () => void;
}

export function createRealtimeEnvelope<TPayload>(input: Omit<RealtimeEnvelope<TPayload>, "id" | "sentAt">): RealtimeEnvelope<TPayload> {
  return {
    ...input,
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sentAt: new Date().toISOString(),
  };
}

export class LocalRealtimeAdapter implements RealtimeAdapter {
  kind: RealtimeTransportKind = "local_fallback";
  private handlers = new Set<(event: RealtimeEnvelope) => void>();
  async connect() {}
  async disconnect() { this.handlers.clear(); }
  async publish<TPayload>(event: RealtimeEnvelope<TPayload>) { this.handlers.forEach((handler) => handler(event as RealtimeEnvelope)); }
  subscribe(handler: (event: RealtimeEnvelope) => void) { this.handlers.add(handler); return () => this.handlers.delete(handler); }
}

export interface CollaborationReconcilerState {
  session: StudioSessionState;
  pending: StudioOperation[];
  acknowledgedRevision: number;
  conflicts: StudioOperation[];
}

export function reconcileOperation(state: CollaborationReconcilerState, incoming: StudioOperation): CollaborationReconcilerState {
  if (incoming.baseRevision < state.acknowledgedRevision - 500) {
    return { ...state, conflicts: [...state.conflicts, incoming] };
  }
  if (incoming.baseRevision > state.session.revision) {
    return { ...state, pending: [...state.pending, incoming] };
  }
  return {
    ...state,
    acknowledgedRevision: Math.max(state.acknowledgedRevision, incoming.baseRevision),
    pending: state.pending.filter((op) => op.id !== incoming.id),
  };
}

export function presenceEnvelope(sessionId: string, actorId: string, presence: StudioPresence) {
  return createRealtimeEnvelope({ sessionId, actorId, type: "presence", payload: presence });
}

export function operationEnvelope(sessionId: string, actorId: string, operation: StudioOperation) {
  return createRealtimeEnvelope({ sessionId, actorId, type: "operation", payload: operation, revision: operation.baseRevision });
}
