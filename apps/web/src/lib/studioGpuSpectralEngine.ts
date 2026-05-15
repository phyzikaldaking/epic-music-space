export type GpuFftPlan = { size: number; workgroupSize: number; stageCount: number };
export type SpectrogramShaderConfig = { width: number; height: number; historyLength: number };
export type CollaborativeGraphNodeMove = { type: "node_move"; actorId: string; nodeId: string; x: number; y: number; updatedAt: string };
export type CollaborativeRoutingEdit = { type: "routing_edit"; actorId: string; sourceNodeId: string; targetNodeId: string; enabled: boolean; updatedAt: string };
export type CollaborativeModulationEdit = { type: "modulation_edit"; actorId: string; sourceId: string; targetNodeId: string; parameterId: string; amount: number; updatedAt: string };
export type CollaborativeAutomationEdit = { type: "automation_edit"; actorId: string; laneId: string; parameterId: string; beat: number; value: number; updatedAt: string };
export type CollaborativePluginGraphEdit = CollaborativeGraphNodeMove | CollaborativeRoutingEdit | CollaborativeModulationEdit | CollaborativeAutomationEdit;

export function createGpuFftPlan(size = 2048): GpuFftPlan {
  const normalizedSize = 2 ** Math.round(Math.log2(Math.max(64, size)));
  return { size: normalizedSize, workgroupSize: 64, stageCount: Math.log2(normalizedSize) };
}

export function gpuFftComputeShader(plan = createGpuFftPlan()) {
  return `
struct Complex { re: f32, im: f32 };
@group(0) @binding(0) var<storage, read_write> bins: array<Complex>;
@compute @workgroup_size(${plan.workgroupSize})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= ${plan.size}u) { return; }
  let phase = -6.28318530718 * f32(i) / f32(${plan.size}u);
  let wr = cos(phase);
  let wi = sin(phase);
  let sample = bins[i];
  bins[i] = Complex(sample.re * wr - sample.im * wi, sample.re * wi + sample.im * wr);
}
`;
}

export function spectrogramFragmentShader() {
  return `
precision highp float;
uniform sampler2D u_spectralHistory;
uniform float u_time;
varying vec2 v_uv;
void main() {
  vec4 energy = texture2D(u_spectralHistory, vec2(v_uv.x, fract(v_uv.y + u_time * 0.04)));
  float heat = smoothstep(0.05, 0.95, energy.r);
  gl_FragColor = vec4(heat, heat * heat * 0.45, 1.0 - heat * 0.8, 1.0);
}
`;
}

export function supportsGpuSpectralPipeline() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export function createSpectrogramHistoryBuffer(config: SpectrogramShaderConfig) {
  return new Float32Array(config.width * config.historyLength);
}

export function pushSpectrogramFrame(history: Float32Array, frame: Float32Array, width: number) {
  const next = new Float32Array(history.length);
  next.set(history.slice(width));
  for (let i = 0; i < width; i += 1) next[next.length - width + i] = frame[i] ?? 0;
  return next;
}

export type CollaborativePluginGraphState = {
  nodes: Record<string, { x: number; y: number; updatedBy?: string; updatedAt?: string }>;
  routes: Record<string, { sourceNodeId: string; targetNodeId: string; enabled: boolean; updatedBy?: string; updatedAt?: string }>;
  modulations: Record<string, { sourceId: string; targetNodeId: string; parameterId: string; amount: number; updatedBy?: string; updatedAt?: string }>;
  automation: Record<string, { laneId: string; parameterId: string; beat: number; value: number; updatedBy?: string; updatedAt?: string }>;
};

export function createEmptyCollaborativePluginGraph(): CollaborativePluginGraphState {
  return { nodes: {}, routes: {}, modulations: {}, automation: {} };
}

export function reduceCollaborativePluginGraph(state: CollaborativePluginGraphState, edit: CollaborativePluginGraphEdit): CollaborativePluginGraphState {
  if (edit.type === "node_move") {
    return { ...state, nodes: { ...state.nodes, [edit.nodeId]: { x: edit.x, y: edit.y, updatedBy: edit.actorId, updatedAt: edit.updatedAt } } };
  }
  if (edit.type === "routing_edit") {
    const id = `${edit.sourceNodeId}->${edit.targetNodeId}`;
    return { ...state, routes: { ...state.routes, [id]: { sourceNodeId: edit.sourceNodeId, targetNodeId: edit.targetNodeId, enabled: edit.enabled, updatedBy: edit.actorId, updatedAt: edit.updatedAt } } };
  }
  if (edit.type === "modulation_edit") {
    const id = `${edit.sourceId}->${edit.targetNodeId}.${edit.parameterId}`;
    return { ...state, modulations: { ...state.modulations, [id]: { sourceId: edit.sourceId, targetNodeId: edit.targetNodeId, parameterId: edit.parameterId, amount: edit.amount, updatedBy: edit.actorId, updatedAt: edit.updatedAt } } };
  }
  const id = `${edit.laneId}.${edit.parameterId}.${edit.beat}`;
  return { ...state, automation: { ...state.automation, [id]: { laneId: edit.laneId, parameterId: edit.parameterId, beat: edit.beat, value: edit.value, updatedBy: edit.actorId, updatedAt: edit.updatedAt } } };
}
