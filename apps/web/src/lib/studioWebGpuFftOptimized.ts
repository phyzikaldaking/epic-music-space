export type Radix2GpuFftPlan = {
  size: number;
  stages: number;
  workgroupSize: number;
  butterfliesPerStage: number[];
};

type SafeGpuBuffer = {
  getMappedRange?: () => ArrayBuffer;
  unmap?: () => void;
  mapAsync?: (mode: number) => Promise<void>;
  destroy?: () => void;
};
type SafeGpuPipeline = { getBindGroupLayout?: (index: number) => unknown };
type SafeGpuPass = {
  setPipeline?: (pipeline: SafeGpuPipeline) => void;
  setBindGroup?: (index: number, bindGroup: unknown) => void;
  dispatchWorkgroups?: (count: number) => void;
  end?: () => void;
};
type SafeGpuEncoder = { beginComputePass?: () => SafeGpuPass; copyBufferToBuffer?: (...args: unknown[]) => void; finish?: () => unknown };
type SafeGpuDevice = {
  createBuffer?: (descriptor: { size: number; usage: number; mappedAtCreation?: boolean }) => SafeGpuBuffer;
  createShaderModule?: (descriptor: { code: string }) => unknown;
  createComputePipeline?: (descriptor: { layout: "auto"; compute: { module: unknown; entryPoint: string } }) => SafeGpuPipeline;
  createBindGroup?: (descriptor: { layout: unknown; entries: Array<{ binding: number; resource: { buffer: SafeGpuBuffer } }> }) => unknown;
  createCommandEncoder?: () => SafeGpuEncoder;
  queue?: { writeBuffer?: (buffer: SafeGpuBuffer, offset: number, data: Uint32Array) => void; submit?: (commands: unknown[]) => void };
};
type SafeGpuAdapter = { requestDevice?: () => Promise<SafeGpuDevice> };
type SafeGpu = { requestAdapter?: () => Promise<SafeGpuAdapter | null> };
type SafeNavigatorWithGpu = Navigator & { gpu?: SafeGpu };

declare const GPUBufferUsage: { STORAGE: number; COPY_SRC: number; COPY_DST: number; MAP_READ: number; UNIFORM: number } | undefined;
declare const GPUMapMode: { READ: number } | undefined;

export function createRadix2GpuFftPlan(size = 2048): Radix2GpuFftPlan {
  const normalized = 2 ** Math.ceil(Math.log2(Math.max(64, size)));
  const stages = Math.log2(normalized);
  return {
    size: normalized,
    stages,
    workgroupSize: 64,
    butterfliesPerStage: Array.from({ length: stages }, (_, stage) => normalized / 2 ** (stage + 1)),
  };
}

export function radix2ButterflyShader(plan = createRadix2GpuFftPlan()) {
  return `
struct Complex { re: f32, im: f32 };
@group(0) @binding(0) var<storage, read_write> bins: array<Complex>;
@group(0) @binding(1) var<uniform> stage: u32;

fn multiply(a: Complex, b: Complex) -> Complex {
  return Complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

@compute @workgroup_size(${plan.workgroupSize})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let n = ${plan.size}u;
  let halfSize = 1u << stage;
  let fullSize = halfSize << 1u;
  let butterfly = id.x;
  if (butterfly >= n / 2u) { return; }
  let group = butterfly / halfSize;
  let pair = butterfly % halfSize;
  let evenIndex = group * fullSize + pair;
  let oddIndex = evenIndex + halfSize;
  let angle = -6.28318530718 * f32(pair) / f32(fullSize);
  let twiddle = Complex(cos(angle), sin(angle));
  let even = bins[evenIndex];
  let odd = multiply(bins[oddIndex], twiddle);
  bins[evenIndex] = Complex(even.re + odd.re, even.im + odd.im);
  bins[oddIndex] = Complex(even.re - odd.re, even.im - odd.im);
}
`;
}

function getSafeGpu() {
  return typeof navigator !== "undefined" ? (navigator as SafeNavigatorWithGpu).gpu : undefined;
}

export async function executeRadix2GpuFft(samples: Float32Array, size = 2048) {
  const plan = createRadix2GpuFftPlan(size);
  const gpu = getSafeGpu();
  if (!gpu?.requestAdapter || !GPUBufferUsage || !GPUMapMode) return null;
  const adapter = await gpu.requestAdapter();
  if (!adapter?.requestDevice) return null;
  const device = await adapter.requestDevice();
  if (!device.createBuffer || !device.createShaderModule || !device.createComputePipeline || !device.createBindGroup || !device.createCommandEncoder || !device.queue?.submit || !device.queue.writeBuffer) return null;
  const complex = new Float32Array(plan.size * 2);
  for (let index = 0; index < plan.size; index += 1) {
    complex[index * 2] = samples[index] ?? 0;
    complex[index * 2 + 1] = 0;
  }
  const storage = device.createBuffer({ size: complex.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, mappedAtCreation: true });
  const mapped = storage.getMappedRange?.();
  if (!mapped) return null;
  new Float32Array(mapped).set(complex);
  storage.unmap?.();
  const stageBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const shader = device.createShaderModule({ code: radix2ButterflyShader(plan) });
  const pipeline = device.createComputePipeline({ layout: "auto", compute: { module: shader, entryPoint: "main" } });
  if (!pipeline.getBindGroupLayout) return null;
  const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: storage } }, { binding: 1, resource: { buffer: stageBuffer } }] });
  for (let stage = 0; stage < plan.stages; stage += 1) {
    device.queue.writeBuffer(stageBuffer, 0, new Uint32Array([stage]));
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass?.();
    if (!pass) return null;
    pass.setPipeline?.(pipeline);
    pass.setBindGroup?.(0, bindGroup);
    pass.dispatchWorkgroups?.(Math.ceil(plan.size / 2 / plan.workgroupSize));
    pass.end?.();
    const command = encoder.finish?.();
    if (command) device.queue.submit([command]);
  }
  const readback = device.createBuffer({ size: complex.byteLength, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer?.(storage, 0, readback, 0, complex.byteLength);
  const command = encoder.finish?.();
  if (command) device.queue.submit([command]);
  await readback.mapAsync?.(GPUMapMode.READ);
  const range = readback.getMappedRange?.();
  if (!range) return null;
  const result = new Float32Array(range).slice();
  readback.unmap?.();
  storage.destroy?.();
  stageBuffer.destroy?.();
  readback.destroy?.();
  const magnitudes = new Float32Array(plan.size / 2);
  for (let index = 0; index < magnitudes.length; index += 1) {
    const re = result[index * 2] ?? 0;
    const im = result[index * 2 + 1] ?? 0;
    magnitudes[index] = Math.sqrt(re * re + im * im);
  }
  return magnitudes;
}

export const SPECTROGRAM_VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const SPECTROGRAM_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D u_history;
uniform float u_scroll;
uniform float u_gain;
varying vec2 v_uv;
void main() {
  vec2 uv = vec2(v_uv.x, fract(v_uv.y + u_scroll));
  float energy = texture2D(u_history, uv).r * u_gain;
  float heat = smoothstep(0.02, 0.9, energy);
  vec3 color = mix(vec3(0.02, 0.03, 0.08), vec3(0.1, 0.85, 1.0), heat);
  color = mix(color, vec3(1.0, 0.2, 0.72), smoothstep(0.55, 1.0, heat));
  gl_FragColor = vec4(color, 1.0);
}
`;

export class ShaderSpectrogramRuntime {
  private gl: WebGLRenderingContext | null;
  private texture: WebGLTexture | null = null;
  private history: Uint8Array;
  private row = 0;

  constructor(private canvas: HTMLCanvasElement, private width = 256, private height = 128) {
    this.gl = canvas.getContext("webgl");
    this.history = new Uint8Array(width * height);
    this.initialize();
  }

  private initialize() {
    const gl = this.gl;
    if (!gl) return;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, this.width, this.height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.history);
  }

  pushFrame(frame: Float32Array) {
    const offset = this.row * this.width;
    for (let index = 0; index < this.width; index += 1) this.history[offset + index] = Math.max(0, Math.min(255, Math.floor((frame[index] ?? 0) * 255)));
    this.row = (this.row + 1) % this.height;
    const gl = this.gl;
    if (!gl || !this.texture) return;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.history);
  }

  render() {
    const gl = this.gl;
    if (!gl) return false;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.01, 0.01, 0.03, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return true;
  }
}
