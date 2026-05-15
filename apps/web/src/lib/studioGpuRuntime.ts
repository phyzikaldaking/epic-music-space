import { createGpuFftPlan, gpuFftComputeShader, pushSpectrogramFrame, reduceCollaborativePluginGraph, type CollaborativePluginGraphEdit, type CollaborativePluginGraphState } from "@/lib/studioGpuSpectralEngine";

export type WebGpuFftRuntime = {
  supported: boolean;
  planSize: number;
  stageCount: number;
  execute: (samples: Float32Array) => Promise<Float32Array>;
};

function fallbackMagnitude(samples: Float32Array) {
  const output = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) output[index] = Math.abs(samples[index]);
  return output;
}

export async function createWebGpuFftRuntime(size = 2048): Promise<WebGpuFftRuntime> {
  const plan = createGpuFftPlan(size);
  const gpu = typeof navigator !== "undefined" ? (navigator as Navigator & { gpu?: GPU }).gpu : undefined;
  if (!gpu) return { supported: false, planSize: plan.size, stageCount: plan.stageCount, execute: async (samples) => fallbackMagnitude(samples) };
  const adapter = await gpu.requestAdapter();
  if (!adapter) return { supported: false, planSize: plan.size, stageCount: plan.stageCount, execute: async (samples) => fallbackMagnitude(samples) };
  const device = await adapter.requestDevice();
  const shader = gpuFftComputeShader(plan);
  const module = device.createShaderModule({ code: shader });
  const pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });

  return {
    supported: true,
    planSize: plan.size,
    stageCount: plan.stageCount,
    async execute(samples: Float32Array) {
      const complex = new Float32Array(plan.size * 2);
      for (let index = 0; index < plan.size; index += 1) {
        complex[index * 2] = samples[index] ?? 0;
        complex[index * 2 + 1] = 0;
      }
      const storage = device.createBuffer({ size: complex.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, mappedAtCreation: true });
      new Float32Array(storage.getMappedRange()).set(complex);
      storage.unmap();
      const readback = device.createBuffer({ size: complex.byteLength, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: storage } }] });
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil(plan.size / plan.workgroupSize));
      pass.end();
      encoder.copyBufferToBuffer(storage, 0, readback, 0, complex.byteLength);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const result = new Float32Array(readback.getMappedRange()).slice();
      readback.unmap();
      const magnitudes = new Float32Array(plan.size);
      for (let index = 0; index < plan.size; index += 1) {
        const re = result[index * 2] ?? 0;
        const im = result[index * 2 + 1] ?? 0;
        magnitudes[index] = Math.sqrt(re * re + im * im);
      }
      storage.destroy();
      readback.destroy();
      return magnitudes;
    },
  };
}

export class WebGlSpectrogramRenderer {
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null;
  private history: Float32Array;
  private width: number;

  constructor(private canvas: HTMLCanvasElement, width = 128, historyLength = 96) {
    this.width = width;
    this.history = new Float32Array(width * historyLength);
    this.gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  }

  pushFrame(frame: Float32Array) {
    this.history = pushSpectrogramFrame(this.history, frame, this.width);
  }

  render(time = performance.now()) {
    const gl = this.gl;
    if (!gl) return false;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.01, 0.02, 0.05, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const rows = Math.floor(this.history.length / this.width);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < this.width; col += 1) {
        const energy = this.history[row * this.width + col] ?? 0;
        gl.scissor((col / this.width) * this.canvas.width, (row / rows) * this.canvas.height, Math.max(1, this.canvas.width / this.width), Math.max(1, this.canvas.height / rows));
        gl.enable(gl.SCISSOR_TEST);
        gl.clearColor(Math.min(1, energy * 0.8), Math.min(1, energy * energy * 0.35), Math.max(0.05, 1 - energy * 0.6), 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }
    gl.disable(gl.SCISSOR_TEST);
    return time >= 0;
  }
}

export class StudioGraphRealtimeTransport {
  private socket?: WebSocket;
  private bus?: BroadcastChannel;
  private listeners = new Set<(edit: CollaborativePluginGraphEdit) => void>();

  constructor(private roomId: string, private websocketUrl?: string) {
    if (typeof BroadcastChannel !== "undefined") this.bus = new BroadcastChannel(`ems-plugin-graph-${roomId}`);
    this.bus?.addEventListener("message", (event) => this.emit(event.data as CollaborativePluginGraphEdit));
    if (websocketUrl && typeof WebSocket !== "undefined") {
      this.socket = new WebSocket(websocketUrl);
      this.socket.addEventListener("message", (event) => this.emit(JSON.parse(event.data) as CollaborativePluginGraphEdit));
    }
  }

  subscribe(listener: (edit: CollaborativePluginGraphEdit) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(edit: CollaborativePluginGraphEdit) {
    this.bus?.postMessage(edit);
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(edit));
    this.emit(edit);
  }

  reduce(state: CollaborativePluginGraphState, edit: CollaborativePluginGraphEdit) {
    return reduceCollaborativePluginGraph(state, edit);
  }

  close() {
    this.socket?.close();
    this.bus?.close();
    this.listeners.clear();
  }

  private emit(edit: CollaborativePluginGraphEdit) {
    this.listeners.forEach((listener) => listener(edit));
  }
}
