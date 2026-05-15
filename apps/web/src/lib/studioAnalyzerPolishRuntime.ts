import { reduceCollaborativePluginGraph, type CollaborativePluginGraphEdit, type CollaborativePluginGraphState } from "@/lib/studioGpuSpectralEngine";

export type AdaptiveFftProfile = {
  size: number;
  resolution: "low" | "medium" | "high" | "ultra";
  reason: string;
};

export type PingPongFramebufferState = {
  readIndex: 0 | 1;
  writeIndex: 0 | 1;
  frame: number;
};

export function selectAdaptiveFftProfile(input: { devicePixelRatio?: number; trackCount: number; cpuLoad: number; gpuSupported: boolean }): AdaptiveFftProfile {
  if (!input.gpuSupported || input.cpuLoad > 0.8) return { size: 512, resolution: "low", reason: "protecting frame budget" };
  if (input.trackCount > 48) return { size: 1024, resolution: "medium", reason: "large project" };
  if ((input.devicePixelRatio ?? 1) > 1.5 && input.cpuLoad < 0.45) return { size: 4096, resolution: "ultra", reason: "high-density display with available headroom" };
  return { size: 2048, resolution: "high", reason: "balanced realtime analyzer" };
}

export function createPingPongFramebufferState(): PingPongFramebufferState {
  return { readIndex: 0, writeIndex: 1, frame: 0 };
}

export function advancePingPongFramebuffer(state: PingPongFramebufferState): PingPongFramebufferState {
  return { readIndex: state.writeIndex, writeIndex: state.readIndex, frame: state.frame + 1 };
}

export class GpuFftCache {
  private cache = new Map<string, Float32Array>();
  constructor(private maxEntries = 32) {}

  key(samples: Float32Array, fftSize: number) {
    const head = samples[0]?.toFixed(4) ?? "0";
    const mid = samples[Math.floor(samples.length / 2)]?.toFixed(4) ?? "0";
    const tail = samples[samples.length - 1]?.toFixed(4) ?? "0";
    return `${fftSize}:${samples.length}:${head}:${mid}:${tail}`;
  }

  get(samples: Float32Array, fftSize: number) {
    return this.cache.get(this.key(samples, fftSize));
  }

  set(samples: Float32Array, fftSize: number, magnitudes: Float32Array) {
    if (this.cache.size >= this.maxEntries) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(this.key(samples, fftSize), magnitudes);
  }
}

export const MULTIPASS_SPECTRAL_VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const MULTIPASS_SPECTRAL_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D u_previousFrame;
uniform sampler2D u_currentFrame;
uniform float u_decay;
uniform float u_gain;
varying vec2 v_uv;
void main() {
  float previous = texture2D(u_previousFrame, v_uv).r * u_decay;
  float current = texture2D(u_currentFrame, v_uv).r * u_gain;
  float energy = max(previous, current);
  vec3 cold = vec3(0.01, 0.02, 0.08);
  vec3 mid = vec3(0.05, 0.8, 1.0);
  vec3 hot = vec3(1.0, 0.18, 0.65);
  vec3 color = mix(cold, mid, smoothstep(0.02, 0.55, energy));
  color = mix(color, hot, smoothstep(0.55, 1.0, energy));
  gl_FragColor = vec4(color, 1.0);
}
`;

export type CollaborativeRoomAuth = {
  roomId: string;
  actorId: string;
  token: string;
  expiresAt: string;
};

export type CollaborativeCursor = {
  actorId: string;
  x: number;
  y: number;
  target?: string;
  updatedAt: string;
};

export type CollaborativeUndoOperation = {
  id: string;
  actorId: string;
  forward: CollaborativePluginGraphEdit;
  inverse: CollaborativePluginGraphEdit;
  createdAt: string;
};

export type CollaborativeTransportClock = {
  actorId: string;
  startedAt: string;
  beat: number;
  bpm: number;
  playing: boolean;
};

export function createRoomAuth(roomId: string, actorId: string): CollaborativeRoomAuth {
  return {
    roomId,
    actorId,
    token: `room-${roomId}-${actorId}-${Date.now()}`,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
  };
}

export function resolveOperationalTransform(local: CollaborativePluginGraphEdit, remote: CollaborativePluginGraphEdit): CollaborativePluginGraphEdit[] {
  if (local.type === "node_move" && remote.type === "node_move" && local.nodeId === remote.nodeId) {
    return [new Date(local.updatedAt) >= new Date(remote.updatedAt) ? local : remote];
  }
  if (local.type === "automation_edit" && remote.type === "automation_edit" && local.laneId === remote.laneId && local.parameterId === remote.parameterId && local.beat === remote.beat) {
    return [new Date(local.updatedAt) >= new Date(remote.updatedAt) ? local : remote];
  }
  return [remote, local];
}

export function reduceCollaborativeEditsWithUndo(state: CollaborativePluginGraphState, edits: CollaborativePluginGraphEdit[], undoStack: CollaborativeUndoOperation[] = []) {
  const nextState = edits.reduce((current, edit) => reduceCollaborativePluginGraph(current, edit), state);
  return { state: nextState, undoStack };
}

export function synchronizedTransportBeat(clock: CollaborativeTransportClock, now = Date.now()) {
  if (!clock.playing) return clock.beat;
  const elapsedSeconds = (now - new Date(clock.startedAt).getTime()) / 1000;
  return clock.beat + (elapsedSeconds * clock.bpm) / 60;
}

export class CollaborativeRoomRuntime {
  private socket?: WebSocket;
  private cursors = new Map<string, CollaborativeCursor>();
  private listeners = new Set<(event: CollaborativePluginGraphEdit | CollaborativeCursor | CollaborativeTransportClock) => void>();

  constructor(private auth: CollaborativeRoomAuth, websocketUrl?: string) {
    if (websocketUrl && typeof WebSocket !== "undefined") {
      this.socket = new WebSocket(`${websocketUrl}?room=${encodeURIComponent(auth.roomId)}&token=${encodeURIComponent(auth.token)}`);
      this.socket.addEventListener("message", (event) => this.emit(JSON.parse(event.data)));
    }
  }

  subscribe(listener: (event: CollaborativePluginGraphEdit | CollaborativeCursor | CollaborativeTransportClock) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publishGraphEdit(edit: CollaborativePluginGraphEdit) {
    this.send(edit);
  }

  publishCursor(cursor: Omit<CollaborativeCursor, "actorId" | "updatedAt">) {
    const event = { ...cursor, actorId: this.auth.actorId, updatedAt: new Date().toISOString() };
    this.cursors.set(this.auth.actorId, event);
    this.send(event);
  }

  publishTransport(clock: Omit<CollaborativeTransportClock, "actorId">) {
    this.send({ ...clock, actorId: this.auth.actorId });
  }

  close() {
    this.socket?.close();
    this.listeners.clear();
  }

  private send(event: CollaborativePluginGraphEdit | CollaborativeCursor | CollaborativeTransportClock) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(event));
    this.emit(event);
  }

  private emit(event: CollaborativePluginGraphEdit | CollaborativeCursor | CollaborativeTransportClock) {
    if ("x" in event && "y" in event) this.cursors.set(event.actorId, event);
    this.listeners.forEach((listener) => listener(event));
  }
}
