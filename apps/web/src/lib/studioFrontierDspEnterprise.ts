import type { CollaborativePluginGraphEdit } from "@/lib/studioGpuSpectralEngine";

type SafeGpuComputePipeline = unknown;
type SafeGpuShaderModule = unknown;
type SafeGpuDevice = {
  createShaderModule?: (descriptor: { code: string }) => SafeGpuShaderModule;
  createComputePipeline?: (descriptor: { layout: "auto"; compute: { module: SafeGpuShaderModule; entryPoint: string } }) => SafeGpuComputePipeline;
};
type SafeCryptoKey = unknown;
type SafeSubtleCrypto = {
  generateKey?: (...args: unknown[]) => Promise<SafeCryptoKey>;
  encrypt?: (...args: unknown[]) => Promise<ArrayBuffer>;
};
type SafeCrypto = { subtle?: SafeSubtleCrypto; getRandomValues?: (array: Uint8Array) => Uint8Array };

export type PersistentComputePipelineKey = "fft" | "convolution" | "granular" | "phase_vocoder" | "audio_graph";
export type GpuAudioKernelNode = {
  id: string;
  kind: PersistentComputePipelineKey;
  inputBufferIds: string[];
  outputBufferId: string;
  parameters: Record<string, number>;
};

export class PersistentWebGpuPipelineRegistry {
  private pipelines = new Map<string, SafeGpuComputePipeline>();
  constructor(private device?: SafeGpuDevice) {}

  getOrCreate(key: string, shaderCode: string) {
    if (!this.device?.createShaderModule || !this.device.createComputePipeline) return null;
    const existing = this.pipelines.get(key);
    if (existing) return existing;
    const module = this.device.createShaderModule({ code: shaderCode });
    const pipeline = this.device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
    this.pipelines.set(key, pipeline);
    return pipeline;
  }

  dispose() {
    this.pipelines.clear();
  }
}

export function gpuAudioGraphKernelShader() {
  return `
struct Params { gain: f32, drive: f32, mix: f32, reserved: f32 };
@group(0) @binding(0) var<storage, read> inputSamples: array<f32>;
@group(0) @binding(1) var<storage, read_write> outputSamples: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  let dry = inputSamples[i];
  let saturated = tanh(dry * (1.0 + params.drive));
  outputSamples[i] = mix(dry, saturated * params.gain, params.mix);
}
`;
}

export function computeConvolutionKernelShader(tapCount = 64) {
  return `
@group(0) @binding(0) var<storage, read> inputSamples: array<f32>;
@group(0) @binding(1) var<storage, read> impulse: array<f32>;
@group(0) @binding(2) var<storage, read_write> outputSamples: array<f32>;
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  var acc = 0.0;
  for (var t = 0u; t < ${tapCount}u; t = t + 1u) {
    if (i >= t) { acc = acc + inputSamples[i - t] * impulse[t]; }
  }
  outputSamples[i] = acc;
}
`;
}

export function gpuGranularSynthesisKernelShader() {
  return `
struct GrainParams { grainSize: f32, density: f32, pitch: f32, mix: f32 };
@group(0) @binding(0) var<storage, read> inputSamples: array<f32>;
@group(0) @binding(1) var<storage, read_write> outputSamples: array<f32>;
@group(0) @binding(2) var<uniform> params: GrainParams;
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  let grain = u32(params.grainSize);
  let sourceIndex = u32(f32(i % grain) * params.pitch) + (i / grain) * grain;
  let window = sin(3.14159265 * f32(i % grain) / max(1.0, params.grainSize));
  outputSamples[i] = mix(inputSamples[i], inputSamples[sourceIndex] * window, params.mix);
}
`;
}

export function gpuPhaseVocoderKernelShader() {
  return `
struct PhaseParams { stretch: f32, phaseLock: f32, transientProtect: f32, mix: f32 };
struct Complex { re: f32, im: f32 };
@group(0) @binding(0) var<storage, read> binsIn: array<Complex>;
@group(0) @binding(1) var<storage, read_write> binsOut: array<Complex>;
@group(0) @binding(2) var<uniform> params: PhaseParams;
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  let source = binsIn[i];
  let magnitude = sqrt(source.re * source.re + source.im * source.im);
  let phase = atan2(source.im, source.re) * params.stretch;
  binsOut[i] = Complex(cos(phase) * magnitude, sin(phase) * magnitude);
}
`;
}

export type EncryptedCollaborationEnvelope = {
  roomId: string;
  senderId: string;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
  createdAt: string;
};

function getSafeCrypto() {
  return typeof globalThis !== "undefined" ? (globalThis.crypto as SafeCrypto | undefined) : undefined;
}

export async function createCollaborationKey() {
  const safeCrypto = getSafeCrypto();
  if (!safeCrypto?.subtle?.generateKey) return null;
  return safeCrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array) {
  if (typeof globalThis !== "undefined" && "btoa" in globalThis) return globalThis.btoa(String.fromCharCode(...bytes));
  return Array.from(bytes).join(",");
}

export async function encryptCollaborationPayload(roomId: string, senderId: string, key: SafeCryptoKey, payload: unknown): Promise<EncryptedCollaborationEnvelope> {
  const safeCrypto = getSafeCrypto();
  const iv = safeCrypto?.getRandomValues?.(new Uint8Array(12)) ?? new Uint8Array(12);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encryptedBuffer = safeCrypto?.subtle?.encrypt ? await safeCrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded) : encoded.buffer.slice(0);
  const encrypted = new Uint8Array(encryptedBuffer);
  return { roomId, senderId, algorithm: "AES-GCM", iv: toBase64(iv), ciphertext: toBase64(encrypted), createdAt: new Date().toISOString() };
}

export type SfuParticipant = { actorId: string; audioTrackId?: string; videoTrackId?: string; screenTrackId?: string; joinedAt: string };
export type SfuRoomState = { roomId: string; participants: SfuParticipant[]; activeSpeakers: string[]; screenShareActorId?: string };

export function reduceSfuRoomState(state: SfuRoomState, participant: SfuParticipant): SfuRoomState {
  return { ...state, participants: [...state.participants.filter((item) => item.actorId !== participant.actorId), participant] };
}

export type DistributedRecordingSession = {
  id: string;
  roomId: string;
  armedTrackIds: string[];
  startedAt?: string;
  stoppedAt?: string;
  authorityActorId: string;
  mediaShardIds: string[];
};

export function startDistributedRecording(session: DistributedRecordingSession) {
  return { ...session, startedAt: new Date().toISOString(), stoppedAt: undefined };
}

export function stopDistributedRecording(session: DistributedRecordingSession) {
  return { ...session, stoppedAt: new Date().toISOString() };
}

export type CloudRenderJob = {
  id: string;
  projectId: string;
  requestedBy: string;
  status: "queued" | "rendering" | "failed" | "complete";
  stems: string[];
  masteringProfile: string;
  createdAt: string;
  updatedAt: string;
};

export function createCloudRenderJob(projectId: string, requestedBy: string, stems: string[], masteringProfile = "streaming-master") {
  const now = new Date().toISOString();
  return { id: `render-${Date.now()}`, projectId, requestedBy, status: "queued" as const, stems, masteringProfile, createdAt: now, updatedAt: now };
}

export type CollaborationModerationSignal = {
  actorId: string;
  severity: "low" | "medium" | "high";
  reason: string;
  suggestedAction: "allow" | "warn" | "lock_track" | "remove_from_room";
};

export function moderateCollaborationEvent(event: CollaborativePluginGraphEdit): CollaborationModerationSignal {
  if (event.type === "automation_edit" && Math.abs(event.value) > 4) return { actorId: event.actorId, severity: "medium", reason: "automation value outside normal range", suggestedAction: "warn" };
  return { actorId: event.actorId, severity: "low", reason: "normal collaborative edit", suggestedAction: "allow" };
}
