export type PluginNodeKind = "gain" | "filter" | "compressor" | "convolution" | "waveshaper" | "delay";

export type PluginNodeConfig = {
  id: string;
  kind: PluginNodeKind;
  enabled?: boolean;
  amount?: number;
  frequency?: number;
  q?: number;
  threshold?: number;
  ratio?: number;
  attack?: number;
  release?: number;
};

export type OfflineGraphInput = {
  samples: Float32Array;
  sampleRate: number;
  pluginChain?: PluginNodeConfig[];
};

function createImpulseBuffer(context: BaseAudioContext, seconds = 1.4, decay = 2.5) {
  const length = Math.floor(context.sampleRate * seconds);
  const impulse = context.createBuffer(1, length, context.sampleRate);
  const channel = impulse.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const noise = Math.random() * 2 - 1;
    channel[i] = noise * Math.pow(1 - i / length, decay);
  }
  return impulse;
}

function makeWaveShaperCurve(amount = 0.3) {
  const samples = 1024;
  const curve = new Float32Array(samples);
  const drive = Math.max(0.01, amount) * 18;
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((1 + drive) * x) / (1 + drive * Math.abs(x));
  }
  return curve;
}

export function supportsOfflineAudioGraph() {
  return typeof OfflineAudioContext !== "undefined";
}

export async function renderOfflineAudioGraph(input: OfflineGraphInput) {
  if (!supportsOfflineAudioGraph()) return input.samples;
  const context = new OfflineAudioContext(1, input.samples.length, input.sampleRate);
  const buffer = context.createBuffer(1, input.samples.length, input.sampleRate);
  buffer.copyToChannel(input.samples, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  let previous: AudioNode = source;

  for (const plugin of input.pluginChain ?? []) {
    if (plugin.enabled === false) continue;
    let node: AudioNode | null = null;
    if (plugin.kind === "gain") {
      const gain = context.createGain();
      gain.gain.value = plugin.amount ?? 1;
      node = gain;
    }
    if (plugin.kind === "filter") {
      const filter = context.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = plugin.frequency ?? 1000;
      filter.Q.value = plugin.q ?? 0.7;
      filter.gain.value = plugin.amount ?? 0;
      node = filter;
    }
    if (plugin.kind === "compressor") {
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = plugin.threshold ?? -18;
      compressor.ratio.value = plugin.ratio ?? 3;
      compressor.attack.value = plugin.attack ?? 0.006;
      compressor.release.value = plugin.release ?? 0.18;
      node = compressor;
    }
    if (plugin.kind === "convolution") {
      const convolver = context.createConvolver();
      convolver.buffer = createImpulseBuffer(context, 1.25, 2.7);
      node = convolver;
    }
    if (plugin.kind === "waveshaper") {
      const shaper = context.createWaveShaper();
      shaper.curve = makeWaveShaperCurve(plugin.amount ?? 0.15);
      shaper.oversample = "2x";
      node = shaper;
    }
    if (plugin.kind === "delay") {
      const delay = context.createDelay(1);
      delay.delayTime.value = plugin.amount ?? 0.08;
      node = delay;
    }
    if (node) {
      previous.connect(node);
      previous = node;
    }
  }

  previous.connect(context.destination);
  source.start(0);
  const rendered = await context.startRendering();
  return rendered.getChannelData(0).slice();
}

export const DEFAULT_MASTERING_PLUGIN_CHAIN: PluginNodeConfig[] = [
  { id: "pre-gain", kind: "gain", amount: 0.92 },
  { id: "low-mid-shape", kind: "filter", frequency: 360, q: 0.9, amount: -1.5 },
  { id: "presence", kind: "filter", frequency: 3200, q: 0.8, amount: 1.8 },
  { id: "glue", kind: "compressor", threshold: -18, ratio: 2.8, attack: 0.008, release: 0.18 },
  { id: "soft-sat", kind: "waveshaper", amount: 0.12 },
];
