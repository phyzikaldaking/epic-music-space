export type SandboxPluginMessage =
  | { type: "init"; pluginId: string; parameters: Record<string, number> }
  | { type: "process"; pluginId: string; frameId: string; samples: Float32Array }
  | { type: "dispose"; pluginId: string };

export type SandboxPluginResult =
  | { type: "ready"; pluginId: string }
  | { type: "processed"; pluginId: string; frameId: string; samples: Float32Array }
  | { type: "error"; pluginId: string; message: string };

export type PluginRuntimeState = {
  pluginId: string;
  status: "idle" | "ready" | "processing" | "failed" | "disposed";
  lastError?: string;
  updatedAt: string;
};

export const AUDIO_WORKLET_FFT_PROCESSOR = `
class EmsFftAnalyzerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.offset = 0;
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this.buffer[this.offset++] = input[i];
      if (this.offset >= this.buffer.length) {
        this.port.postMessage({ type: 'fft-frame', samples: this.buffer.slice(0) });
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('ems-fft-analyzer', EmsFftAnalyzerProcessor);
`;

export const PLUGIN_SANDBOX_WORKER = `
const plugins = new Map();
self.onmessage = (event) => {
  const message = event.data;
  try {
    if (message.type === 'init') {
      plugins.set(message.pluginId, { parameters: message.parameters || {} });
      self.postMessage({ type: 'ready', pluginId: message.pluginId });
      return;
    }
    if (message.type === 'dispose') {
      plugins.delete(message.pluginId);
      self.postMessage({ type: 'ready', pluginId: message.pluginId });
      return;
    }
    if (message.type === 'process') {
      const state = plugins.get(message.pluginId);
      if (!state) throw new Error('Plugin is not initialized');
      const drive = Number(state.parameters.drive || state.parameters.glue || 0.15);
      const output = new Float32Array(message.samples.length);
      for (let i = 0; i < message.samples.length; i++) output[i] = Math.tanh(message.samples[i] * (1 + drive));
      self.postMessage({ type: 'processed', pluginId: message.pluginId, frameId: message.frameId, samples: output }, [output.buffer]);
    }
  } catch (error) {
    self.postMessage({ type: 'error', pluginId: message.pluginId || 'unknown', message: error && error.message ? error.message : 'Plugin sandbox failed' });
  }
};
`;

export function createPluginSandboxWorker() {
  if (typeof Worker === "undefined") return null;
  const blob = new Blob([PLUGIN_SANDBOX_WORKER], { type: "application/javascript" });
  return new Worker(URL.createObjectURL(blob));
}

export async function createAudioWorkletFftNode(context: AudioContext) {
  const blob = new Blob([AUDIO_WORKLET_FFT_PROCESSOR], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  await context.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  return new AudioWorkletNode(context, "ems-fft-analyzer");
}

export function reducePluginRuntimeState(current: PluginRuntimeState[], result: SandboxPluginResult): PluginRuntimeState[] {
  const previous = current.find((item) => item.pluginId === result.pluginId);
  const status: PluginRuntimeState["status"] = result.type === "error" ? "failed" : result.type === "ready" ? "ready" : "processing";
  const next: PluginRuntimeState = { pluginId: result.pluginId, status, lastError: result.type === "error" ? result.message : previous?.lastError, updatedAt: new Date().toISOString() };
  return [...current.filter((item) => item.pluginId !== result.pluginId), next];
}
