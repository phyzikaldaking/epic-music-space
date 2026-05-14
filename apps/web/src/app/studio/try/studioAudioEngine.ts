import { scheduleDrumHit, type DrumKind, type DrumKitId } from "@/components/daw/beatMachine";

export type StudioAudioEngine = {
  context: AudioContext;
  master: GainNode;
  compressor: DynamicsCompressorNode;
  playDrum: (kind: DrumKind, options?: { kit?: DrumKitId; velocity?: number; when?: number }) => void;
  now: () => number;
  close: () => Promise<void>;
};

let engine: StudioAudioEngine | null = null;

function createAudioContext() {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return new Ctor({ latencyHint: "interactive", sampleRate: 48000 });
}

export function getStudioAudioEngine(): StudioAudioEngine {
  if (engine && engine.context.state !== "closed") return engine;

  const context = createAudioContext();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 18;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.18;

  const master = context.createGain();
  master.gain.value = 0.82;
  compressor.connect(master);
  master.connect(context.destination);

  engine = {
    context,
    master,
    compressor,
    playDrum: (kind, options) => {
      if (context.state === "suspended") void context.resume();
      scheduleDrumHit(context, compressor, kind, {
        kit: options?.kit ?? "trap",
        when: options?.when ?? context.currentTime,
        velocity: options?.velocity ?? 0.9,
      });
    },
    now: () => context.currentTime,
    close: async () => {
      if (context.state !== "closed") await context.close();
      engine = null;
    },
  };

  return engine;
}
