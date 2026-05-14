import { scheduleDrumHit, type DrumKind, type DrumKitId } from "@/components/daw/beatMachine";

export type AutomationPoint = { time: number; value: number; curve?: "linear" | "exponential" | "step" };
export type MidiNoteEvent = { id: string; note: number; velocity: number; start: number; duration: number; channel?: number };
export type StudioStemBus = { id: string; gain: GainNode; pan: StereoPannerNode; analyser: AnalyserNode };
export type ScheduleAudioEvent = { id: string; trackId: string; kind: DrumKind; when: number; velocity?: number; kit?: DrumKitId };

export type StudioAudioEngine = {
  context: AudioContext;
  master: GainNode;
  compressor: DynamicsCompressorNode;
  limiter: DynamicsCompressorNode;
  stems: Map<string, StudioStemBus>;
  getStemBus: (trackId: string) => StudioStemBus;
  scheduleDrum: (event: ScheduleAudioEvent) => void;
  scheduleMidiNote: (event: MidiNoteEvent & { trackId: string; when?: number }) => void;
  automateGain: (trackId: string, points: AutomationPoint[], startAt?: number) => void;
  automatePan: (trackId: string, points: AutomationPoint[], startAt?: number) => void;
  playDrum: (kind: DrumKind, options?: { kit?: DrumKitId; velocity?: number; when?: number; trackId?: string }) => void;
  now: () => number;
  close: () => Promise<void>;
};

let engine: StudioAudioEngine | null = null;

function createAudioContext() {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return new Ctor({ latencyHint: "interactive", sampleRate: 48000 });
}

function applyAutomation(param: AudioParam, points: AutomationPoint[], startAt: number) {
  if (!points.length) return;
  param.cancelScheduledValues(startAt);
  points.forEach((point, index) => {
    const time = startAt + Math.max(0, point.time);
    if (index === 0 || point.curve === "step") param.setValueAtTime(point.value, time);
    else if (point.curve === "exponential") param.exponentialRampToValueAtTime(Math.max(0.0001, point.value), time);
    else param.linearRampToValueAtTime(point.value, time);
  });
}

export function getStudioAudioEngine(): StudioAudioEngine {
  if (engine && engine.context.state !== "closed") return engine;

  const context = createAudioContext();
  const stems = new Map<string, StudioStemBus>();

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 18;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.18;

  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 2;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;

  const master = context.createGain();
  master.gain.value = 0.82;
  compressor.connect(limiter);
  limiter.connect(master);
  master.connect(context.destination);

  const getStemBus = (trackId: string): StudioStemBus => {
    const existing = stems.get(trackId);
    if (existing) return existing;
    const gain = context.createGain();
    const pan = context.createStereoPanner();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    gain.gain.value = 0.85;
    pan.pan.value = 0;
    gain.connect(pan);
    pan.connect(analyser);
    analyser.connect(compressor);
    const bus = { id: trackId, gain, pan, analyser };
    stems.set(trackId, bus);
    return bus;
  };

  const scheduleMidiNote = (event: MidiNoteEvent & { trackId: string; when?: number }) => {
    if (context.state === "suspended") void context.resume();
    const bus = getStemBus(event.trackId);
    const when = event.when ?? context.currentTime + event.start;
    const osc = context.createOscillator();
    const gain = context.createGain();
    const frequency = 440 * 2 ** ((event.note - 69) / 12);
    osc.type = event.note < 48 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(frequency, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, event.velocity), when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.04, event.duration));
    osc.connect(gain);
    gain.connect(bus.gain);
    osc.start(when);
    osc.stop(when + Math.max(0.05, event.duration + 0.04));
  };

  engine = {
    context,
    master,
    compressor,
    limiter,
    stems,
    getStemBus,
    scheduleDrum: (event) => {
      if (context.state === "suspended") void context.resume();
      const bus = getStemBus(event.trackId);
      scheduleDrumHit(context, bus.gain, event.kind, { kit: event.kit ?? "trap", when: event.when, velocity: event.velocity ?? 0.9 });
    },
    scheduleMidiNote,
    automateGain: (trackId, points, startAt = context.currentTime) => applyAutomation(getStemBus(trackId).gain.gain, points, startAt),
    automatePan: (trackId, points, startAt = context.currentTime) => applyAutomation(getStemBus(trackId).pan.pan, points, startAt),
    playDrum: (kind, options) => {
      const bus = getStemBus(options?.trackId ?? "preview");
      if (context.state === "suspended") void context.resume();
      scheduleDrumHit(context, bus.gain, kind, { kit: options?.kit ?? "trap", when: options?.when ?? context.currentTime, velocity: options?.velocity ?? 0.9 });
    },
    now: () => context.currentTime,
    close: async () => {
      stems.forEach((bus) => {
        bus.gain.disconnect();
        bus.pan.disconnect();
        bus.analyser.disconnect();
      });
      stems.clear();
      if (context.state !== "closed") await context.close();
      engine = null;
    },
  };

  return engine;
}
