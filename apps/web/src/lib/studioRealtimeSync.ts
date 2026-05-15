import type { CollaborationCursor, LaneLock } from "@/lib/studioCollaborationEngine";
import type { CrdtOperation } from "@/app/studio/try/studioDawTypes";

export type StudioRealtimeMessage =
  | { type: "cursor"; cursor: CollaborationCursor }
  | { type: "operation"; operation: CrdtOperation }
  | { type: "lane_lock"; lock: LaneLock }
  | { type: "transport"; actorId: string; playing: boolean; beat: number; updatedAt: string }
  | { type: "automation"; actorId: string; laneId: string; parameterId: string; value: number; beat: number; updatedAt: string };

export type StudioRealtimeState = {
  cursors: CollaborationCursor[];
  operations: CrdtOperation[];
  locks: LaneLock[];
  transport?: Extract<StudioRealtimeMessage, { type: "transport" }>;
  automation: Extract<StudioRealtimeMessage, { type: "automation" }>[];
};

export function createEmptyRealtimeState(): StudioRealtimeState {
  return { cursors: [], operations: [], locks: [], automation: [] };
}

export function reduceStudioRealtimeMessage(state: StudioRealtimeState, message: StudioRealtimeMessage): StudioRealtimeState {
  if (message.type === "cursor") {
    return { ...state, cursors: [...state.cursors.filter((cursor) => cursor.actorId !== message.cursor.actorId), message.cursor] };
  }
  if (message.type === "operation") {
    return { ...state, operations: [...state.operations.filter((operation) => operation.id !== message.operation.id), message.operation] };
  }
  if (message.type === "lane_lock") {
    return { ...state, locks: [...state.locks.filter((lock) => lock.laneId !== message.lock.laneId), message.lock] };
  }
  if (message.type === "transport") return { ...state, transport: message };
  return { ...state, automation: [...state.automation.filter((item) => item.laneId !== message.laneId || item.parameterId !== message.parameterId || item.actorId !== message.actorId), message] };
}

export class StudioRealtimeBus {
  private channel?: BroadcastChannel;
  private listeners = new Set<(message: StudioRealtimeMessage) => void>();

  constructor(roomId: string) {
    if (typeof BroadcastChannel !== "undefined") this.channel = new BroadcastChannel(`ems-studio-${roomId}`);
    this.channel?.addEventListener("message", (event) => this.listeners.forEach((listener) => listener(event.data as StudioRealtimeMessage)));
  }

  subscribe(listener: (message: StudioRealtimeMessage) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(message: StudioRealtimeMessage) {
    this.channel?.postMessage(message);
    this.listeners.forEach((listener) => listener(message));
  }

  close() {
    this.channel?.close();
    this.listeners.clear();
  }
}
