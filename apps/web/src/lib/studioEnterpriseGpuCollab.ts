import type { CollaborativePluginGraphEdit, CollaborativePluginGraphState } from "@/lib/studioGpuSpectralEngine";
import { reduceCollaborativePluginGraph } from "@/lib/studioGpuSpectralEngine";

type SafeGpuBuffer = { destroy?: () => void };
type SafeGpuDevice = { createBuffer?: (descriptor: { size: number; usage: number }) => SafeGpuBuffer };
type SafeRtcPeerConnection = { close: () => void; onicecandidate: ((event: { candidate?: { toJSON: () => unknown } | null }) => void) | null };
type SafeMediaStream = { id: string };

export type WebGpuRenderGraphNode = {
  id: string;
  kind: "fft" | "spectrogram" | "texture_compute" | "postprocess" | "readback";
  inputs: string[];
  outputs: string[];
  priority: number;
};

export type WebGpuMemoryPoolBuffer = {
  id: string;
  size: number;
  usage: number;
  inUse: boolean;
  buffer?: SafeGpuBuffer;
};

export type RenderGraphSchedule = {
  frameId: string;
  orderedNodes: WebGpuRenderGraphNode[];
  asyncBatches: WebGpuRenderGraphNode[][];
};

export function scheduleWebGpuRenderGraph(nodes: WebGpuRenderGraphNode[]): RenderGraphSchedule {
  const orderedNodes = [...nodes].sort((a, b) => a.priority - b.priority);
  const asyncBatches = orderedNodes.reduce<WebGpuRenderGraphNode[][]>((batches, node) => {
    const last = batches[batches.length - 1];
    const conflicts = last?.some((item) => item.outputs.some((output) => node.inputs.includes(output) || node.outputs.includes(output)));
    if (!last || conflicts) batches.push([node]);
    else last.push(node);
    return batches;
  }, []);
  return { frameId: `gpu-frame-${Date.now()}`, orderedNodes, asyncBatches };
}

export class WebGpuMemoryPool {
  private buffers = new Map<string, WebGpuMemoryPoolBuffer>();

  constructor(private device?: SafeGpuDevice) {}

  acquire(id: string, size: number, usage: number) {
    const reusable = [...this.buffers.values()].find((buffer) => !buffer.inUse && buffer.size >= size && buffer.usage === usage);
    if (reusable) {
      reusable.inUse = true;
      return reusable;
    }
    const entry: WebGpuMemoryPoolBuffer = { id, size, usage, inUse: true, buffer: this.device?.createBuffer?.({ size, usage }) };
    this.buffers.set(id, entry);
    return entry;
  }

  release(id: string) {
    const buffer = this.buffers.get(id);
    if (buffer) buffer.inUse = false;
  }

  dispose() {
    this.buffers.forEach((entry) => entry.buffer?.destroy?.());
    this.buffers.clear();
  }
}

export function textureFftComputeShader() {
  return `
struct Pixel { value: vec4<f32> };
@group(0) @binding(0) var<storage, read> inputTexture: array<Pixel>;
@group(0) @binding(1) var<storage, read_write> outputTexture: array<Pixel>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.y * 512u + id.x;
  let source = inputTexture[index].value;
  let energy = length(source.rgb);
  outputTexture[index].value = vec4<f32>(energy, energy * energy, 1.0 - energy, 1.0);
}
`;
}

export type CrdtSnapshot = {
  version: number;
  compressed: string;
  operationCount: number;
  createdAt: string;
};

export function compressCrdtSnapshot(state: CollaborativePluginGraphState): CrdtSnapshot {
  const serialized = JSON.stringify(state);
  let compressed = "";
  for (let index = 0; index < serialized.length; index += 1) {
    const current = serialized[index];
    let run = 1;
    while (serialized[index + run] === current && run < 35) run += 1;
    compressed += run > 3 ? `${current}~${run}` : current.repeat(run);
    index += run - 1;
  }
  return { version: 1, compressed, operationCount: Object.keys(state.nodes).length + Object.keys(state.routes).length + Object.keys(state.modulations).length + Object.keys(state.automation).length, createdAt: new Date().toISOString() };
}

export type PeerMeshSignal = {
  type: "offer" | "answer" | "ice" | "graph_edit" | "media_stream";
  roomId: string;
  actorId: string;
  targetActorId?: string;
  payload: unknown;
  createdAt: string;
};

export class PeerMeshSyncRuntime {
  private peers = new Map<string, SafeRtcPeerConnection>();
  private listeners = new Set<(signal: PeerMeshSignal) => void>();

  constructor(private roomId: string, private actorId: string) {}

  createPeer(targetActorId: string) {
    if (typeof globalThis === "undefined" || !("RTCPeerConnection" in globalThis)) return null;
    const PeerCtor = (globalThis as typeof globalThis & { RTCPeerConnection?: new () => SafeRtcPeerConnection }).RTCPeerConnection;
    if (!PeerCtor) return null;
    const peer = new PeerCtor();
    peer.onicecandidate = (event) => {
      if (event.candidate) this.emit({ type: "ice", roomId: this.roomId, actorId: this.actorId, targetActorId, payload: event.candidate.toJSON(), createdAt: new Date().toISOString() });
    };
    this.peers.set(targetActorId, peer);
    return peer;
  }

  subscribe(listener: (signal: PeerMeshSignal) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  broadcastGraphEdit(edit: CollaborativePluginGraphEdit) {
    this.emit({ type: "graph_edit", roomId: this.roomId, actorId: this.actorId, payload: edit, createdAt: new Date().toISOString() });
  }

  close() {
    this.peers.forEach((peer) => peer.close());
    this.peers.clear();
    this.listeners.clear();
  }

  private emit(signal: PeerMeshSignal) {
    this.listeners.forEach((listener) => listener(signal));
  }
}

export type SessionAuthorityState = {
  authorityActorId: string;
  epoch: number;
  lastHeartbeatAt: string;
  arbitrationReason: string;
};

export function arbitrateSessionAuthority(current: SessionAuthorityState | null, candidates: Array<{ actorId: string; latencyMs: number; joinedAt: string }>): SessionAuthorityState {
  const sorted = [...candidates].sort((a, b) => a.latencyMs - b.latencyMs || new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
  const winner = sorted[0]?.actorId ?? current?.authorityActorId ?? "local";
  return { authorityActorId: winner, epoch: (current?.epoch ?? 0) + (winner === current?.authorityActorId ? 0 : 1), lastHeartbeatAt: new Date().toISOString(), arbitrationReason: "lowest latency then earliest join" };
}

export type CollaborativeMediaLayer = {
  voiceEnabled: boolean;
  videoEnabled: boolean;
  distributedMediaEnabled: boolean;
  streamIds: string[];
};

export function attachCollaborativeMediaStream(layer: CollaborativeMediaLayer, stream: SafeMediaStream | null): CollaborativeMediaLayer {
  if (!stream) return layer;
  return { ...layer, distributedMediaEnabled: true, streamIds: [...new Set([...layer.streamIds, stream.id])] };
}

export function replayCollaborativeOperations(base: CollaborativePluginGraphState, operations: CollaborativePluginGraphEdit[]) {
  return operations.reduce((state, operation) => reduceCollaborativePluginGraph(state, operation), base);
}
