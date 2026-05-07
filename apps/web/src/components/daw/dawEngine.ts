/**
 * EMS DAW audio engine. Pure Web Audio + DOM, no React.
 *
 * Architecture (signal flow per track):
 *
 *   [BufferSource | LiveMicSource]  →  EQ/Comp  →  Gain  →  Pan  →  ┐
 *                                                            sends →  ├→  Shared Reverb/Delay Returns
 *   [BufferSource | LiveMicSource]  →  EQ/Comp  →  Gain  →  Pan  →  ┘
 *                                                           dry + returns → MasterGain → AnalyserNode → destination
 *
 * The master AnalyserNode powers the output meter without forcing every
 * listener to wire their own. Tracks are just gain+pan nodes — playback
 * sources are AudioBufferSourceNodes scheduled together at play() time
 * so all tracks stay sample-aligned with the transport.
 *
 * Blueprint note: time-based FX are send-first. Tracks expose reverb
 * and delay amounts as sends into shared aux returns; EQ/comp remain
 * explicit per-track inserts.
 *
 * Recording: MediaRecorder per track, stored as Blob → decoded into an
 * AudioBuffer when recording stops. We hold blobs around for export
 * later (Phase 4 mastering).
 */

import {
  type BeatPattern,
  type DrumKind,
  DRUM_LANES,
  STEPS,
  STEPS_PER_BEAT,
  emptyPattern,
  scheduleDrumHit,
  type DrumKitId,
} from "./beatMachine";
import { audioBufferToWav } from "./wavEncoder";

export type TrackId = string;

export interface TrackFx {
  /** EQ — three biquads acting as low shelf / mid bell / high shelf. */
  eqLowDb: number; // -12..+12 @ 200 Hz
  eqMidDb: number; // -12..+12 @ 1000 Hz, Q=1
  eqHighDb: number; // -12..+12 @ 5000 Hz
  /** Compressor — DynamicsCompressor parameters. */
  compEnabled: boolean;
  compThreshDb: number; // -60..0
  compRatio: number; // 1..20
  /** Reverb send into the shared hall/plate return. */
  reverbWet: number; // 0..1
  reverbDecaySec: number; // 0.2..6, shared return follows the most recent edit
  /** Delay send into the shared tempo-locked return. */
  delayWet: number; // 0..1
  delayBeats: number; // 0.25, 0.5, 1.0, etc, shared return follows the most recent edit
  delayFeedback: number; // 0..0.85, shared return follows the most recent edit
}

export interface TrackState {
  id: TrackId;
  name: string;
  color: string;
  gainDb: number; // -60 .. +6
  pan: number; // -1 .. +1
  muted: boolean;
  solo: boolean;
  armed: boolean; // true → next record() captures into this track
  /** Live monitor through this track's FX chain to the speakers.
   *  Default: false. Turning this on while NOT wearing headphones
   *  creates a feedback loop (mic → speakers → mic). The DAW UI
   *  surfaces a confirm dialog before flipping this. */
  monitorEnabled: boolean;
  hasAudio: boolean; // true once a buffer or blob is attached
  durationSec: number;
  level: number; // 0..1 instantaneous output level (UI-driven)
  fx: TrackFx;
  /** When set, this track's level ducks based on the source track's
   *  amplitude — modern sidechain pumping. null disables. */
  sidechainFromId: TrackId | null;
  /** Sidechain depth: 0 = no ducking, 1 = full duck on peaks. */
  sidechainAmount: number;
}

interface TrackInternal {
  state: TrackState;
  // Signal flow: fxIn → sidechainDuck → EQ → comp/bypass → gain → pan → meter → master
  //                                                                ├→ reverbSend → shared reverb return
  //                                                                └→ delaySend → shared delay return
  fxIn: GainNode;
  /** Gain node that's modulated by the sidechain source's amplitude
   *  during tick(). Default 1.0 (no ducking). */
  sidechainDuck: GainNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  compBypass: GainNode;
  compMix: GainNode;
  reverbSendGain: GainNode;
  delaySendGain: GainNode;
  gainNode: GainNode;
  panNode: StereoPannerNode;
  meterAnalyser: AnalyserNode;
  meterBuf: Uint8Array;
  buffer: AudioBuffer | null;
  blob: Blob | null;
  source: AudioBufferSourceNode | null;
  liveSource: MediaStreamAudioSourceNode | null;
  liveStream: MediaStream | null;
  /** Gain node sitting between liveSource and fxIn. Defaults to 0 so the
   *  performer's voice does NOT route to speakers by default — that's
   *  what causes feedback when monitoring without headphones. UI flips
   *  this to 1 only after explicit confirm. */
  monitorGain: GainNode | null;
  recorder: MediaRecorder | null;
  recordedChunks: Blob[];
}

export interface TransportState {
  isPlaying: boolean;
  isRecording: boolean;
  bpm: number;
  positionSec: number;
  metronomeOn: boolean;
  latencyMode: "recording" | "mixing";
  vocalCaptureProfile: "raw" | "punchy" | "smooth" | "hybrid";
  masterDb: number; // -60 .. +6
  masterLevel: number; // 0..1 instantaneous
  /** True ⇒ DynamicsCompressor at end of master chain pulling -3 dB ratio 20:1. */
  masterLimiterOn: boolean;
  /** Loop region. When loopEnabled is true, transport wraps from
   *  loopEndSec back to loopStartSec on the next tick after crossing. */
  loopEnabled: boolean;
  loopStartSec: number;
  loopEndSec: number;
  /** Master EQ — same biquad shape as track EQ. */
  masterEqLowDb: number; // -12..+12 @ 200 Hz
  masterEqMidDb: number; // -12..+12 @ 1000 Hz
  masterEqHighDb: number; // -12..+12 @ 5000 Hz
  /** Spectrum analyzer — 32 frequency bin amplitudes 0..1, log-frequency. */
  masterSpectrum: number[];
  /** Approximate short-term LUFS (K-weighted). Negative scale; -14 is the
   *  Spotify/Apple loudness target. -Infinity when silent. */
  masterLufs: number;
  /** Linear true-peak amplitude 0..1 of the most recent frame. */
  masterTruePeak: number;
}

// Re-export the canonical DrumKitId so consumers don't need to reach
// into beatMachine for it. Keep beatMachine.ts as the single source of
// truth for the actual kit list.
export type { DrumKitId } from "./beatMachine";
export type PatternBank = "A" | "B" | "C" | "D";

export interface BeatMachineState {
  /** When true, the engine schedules drum hits on each beat-bucket while
   *  transport is playing. Independent of metronome. */
  enabled: boolean;
  /** Active pattern (snapshot of bankPatterns[activeBank]). */
  pattern: BeatPattern;
  /** Currently-playing step (UI light). -1 when stopped. */
  activeStep: number;
  /** Pattern banks A/B/C/D. activeBank decides which one plays. */
  activeBank: PatternBank;
  bankPatterns: Record<PatternBank, BeatPattern>;
  /** Drum kit preset — modulates synthesis on each hit. */
  kit: DrumKitId;
}

export interface AuxBusState {
  reverbReturn: {
    enabled: boolean;
    decaySec: number;
    level: number;
  };
  delayReturn: {
    enabled: boolean;
    beats: number;
    feedback: number;
    level: number;
  };
}

export type SynthWave = "sine" | "triangle" | "sawtooth" | "square";

/** A single MIDI note inside a clip. Position is in beats from clip
 *  start, NOT in seconds — so it stays musically correct when the BPM
 *  changes after recording. */
export interface MidiNote {
  note: number; // 0..127 MIDI note number
  startBeat: number;
  durationBeats: number;
  velocity: number; // 0..1
}

/** A recorded MIDI region. lengthBeats is what the playback scheduler
 *  loops over — set to the end time of the last note + a small tail. */
export interface MidiClip {
  notes: MidiNote[];
  lengthBeats: number;
}

export interface MidiSynthState {
  /** True when Web MIDI access has been granted. */
  midiAvailable: boolean;
  /** Hardware MIDI device name(s) currently feeding notes. Empty list
   *  is fine — the on-screen keyboard still works. */
  deviceNames: string[];
  /** Voice settings — every note plays one voice with these params. */
  wave: SynthWave;
  /** Attack / release in seconds. */
  attackSec: number;
  releaseSec: number;
  /** Lowpass filter cutoff in Hz. */
  filterHz: number;
  /** Currently-held MIDI notes, for the on-screen keyboard highlight. */
  activeNotes: number[];
  /** True while we're capturing a MIDI clip into the synth track. */
  recordingClip: boolean;
  /** The clip currently bound to the synth track, if any. Read-only —
   *  the engine owns the canonical copy. */
  clip: MidiClip | null;
}

export interface EngineSnapshot {
  transport: TransportState;
  tracks: TrackState[];
  beat: BeatMachineState;
  midi: MidiSynthState;
  aux: AuxBusState;
}

export type RenderQuality = "standard" | "high" | "ultra";

export interface RenderMixOptions {
  quality?: RenderQuality;
}

/** On-disk project format. Versioned so we can migrate older saves. */
export interface ProjectFileTrack {
  id: TrackId;
  name: string;
  color: string;
  gainDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  fx: TrackFx;
  durationSec: number;
  /** Original recording blob (WebM/Opus) when available, else WAV-encoded
   *  re-render of an in-memory AudioBuffer. Null for empty tracks. */
  audioBlob: Blob | null;
}

export interface ProjectFile {
  version: 1;
  savedAt: string;
  transport: {
    bpm: number;
    masterDb: number;
    masterLimiterOn: boolean;
    loopEnabled: boolean;
    loopStartSec: number;
    loopEndSec: number;
  };
  beat: {
    enabled: boolean;
    pattern: BeatPattern;
  };
  midi: {
    wave: SynthWave;
    attackSec: number;
    releaseSec: number;
    filterHz: number;
  };
  aux: {
    reverbReturn: AuxBusState["reverbReturn"];
    delayReturn: AuxBusState["delayReturn"];
  };
  tracks: ProjectFileTrack[];
}

const DB_TO_LINEAR = (db: number): number => Math.pow(10, db / 20);
const TRANSPORT_START_LEAD_SEC = 0.05;
const VOCAL_MAX_AUTO_GAIN = 2.0;
const VOCAL_TARGET_PEAK = 0.82;

function clonePattern(p: BeatPattern): BeatPattern {
  // Use emptyPattern() as the base so the type system sees all 8 lanes
  // initialized — passing `{} as BeatPattern` to reduce() leaves the
  // accumulator structurally narrow and TS rejects the result.
  const out = emptyPattern();
  for (const lane of DRUM_LANES) out[lane] = [...p[lane]];
  return out;
}

export class DawEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private masterEqLow: BiquadFilterNode | null = null;
  private masterEqMid: BiquadFilterNode | null = null;
  private masterEqHigh: BiquadFilterNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private masterMeterBuf: Uint8Array | null = null;
  private masterSpectrumAnalyser: AnalyserNode | null = null;
  private masterSpectrumBuf: Uint8Array | null = null;
  // K-weighting for LUFS. Two biquads in series — high-shelf at 1.5kHz +4dB
  // and high-pass at 38Hz — applied to a side branch we sum then RMS.
  private lufsAnalyser: AnalyserNode | null = null;
  private lufsBuf: Float32Array | null = null;
  private reverbReturnIn: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbReturnGain: GainNode | null = null;
  private delayReturnIn: GainNode | null = null;
  private delay: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayReturnGain: GainNode | null = null;
  private metronomeOsc: OscillatorNode | null = null;
  private metronomeGain: GainNode | null = null;
  private metronomeNextTime = 0;
  private metronomeTimerId: number | null = null;

  private beatMachine: BeatMachineState = {
    enabled: false,
    pattern: emptyPattern(),
    activeStep: -1,
    activeBank: "A",
    bankPatterns: {
      A: emptyPattern(),
      B: emptyPattern(),
      C: emptyPattern(),
      D: emptyPattern(),
    },
    kit: "acoustic",
  };
  /** Beat track ID that drum hits route into. Created in init() so the
   *  user sees it as a real strip in the mixer. */
  private beatTrackId: TrackId | null = null;
  private beatNextTime = 0;
  private beatNextStep = 0;
  private beatTimerId: number | null = null;

  /** MIDI / synth state. activeVoices is keyed by note number so a re-
   *  triggered note steals (kills) the previous voice cleanly. */
  private midi: MidiSynthState = {
    midiAvailable: false,
    deviceNames: [],
    wave: "sawtooth",
    attackSec: 0.01,
    releaseSec: 0.25,
    filterHz: 4000,
    activeNotes: [],
    recordingClip: false,
    clip: null,
  };
  /** Currently-recording MIDI events: { note, downBeat, upBeat | null, velocity } */
  private midiRecordEvents: Array<{
    note: number;
    downBeat: number;
    upBeat: number | null;
    velocity: number;
  }> = [];
  private midiRecordStartTime = 0;
  /** Look-ahead scheduler for MIDI clip playback. Same pattern as beat. */
  private midiClipNextTime = 0;
  private midiClipNextBeat = 0;
  private midiClipTimerId: number | null = null;
  private synthTrackId: TrackId | null = null;
  private activeVoices: Map<
    number,
    { osc: OscillatorNode; amp: GainNode; filter: BiquadFilterNode }
  > = new Map();
  private midiAccess: MIDIAccess | null = null;
  private midiInputHandlers: Array<{ input: MIDIInput; handler: (e: Event) => void }> = [];

  private aux: AuxBusState = {
    reverbReturn: {
      enabled: true,
      decaySec: 2.5,
      level: 0.85,
    },
    delayReturn: {
      enabled: true,
      beats: 0.5,
      feedback: 0.35,
      level: 0.7,
    },
  };

  private tracks: Map<TrackId, TrackInternal> = new Map();

  private transport: TransportState = {
    isPlaying: false,
    isRecording: false,
    bpm: 90,
    positionSec: 0,
    metronomeOn: false,
    latencyMode: "recording",
    vocalCaptureProfile: "punchy",
    masterDb: 0,
    masterLevel: 0,
    masterLimiterOn: true,
    loopEnabled: false,
    loopStartSec: 0,
    loopEndSec: 8,
    masterEqLowDb: 0,
    masterEqMidDb: 0,
    masterEqHighDb: 0,
    masterSpectrum: new Array(32).fill(0),
    masterLufs: -Infinity,
    masterTruePeak: 0,
  };

  private playStartCtxTime = 0;
  private playStartPosition = 0;
  /** Alignment trim to compensate MediaRecorder starting before scheduled playback. */
  private recordingAlignmentTrimSec = 0;
  /** Tap-tempo: timestamps of the most recent taps (ms epoch). */
  private tapTimestamps: number[] = [];
  /** Cached downsampled waveform peaks per track for the WaveformView.
   *  Recomputed lazily when a buffer changes. */
  private waveformCache: Map<TrackId, number[]> = new Map();

  private listeners = new Set<() => void>();
  private rafId: number | null = null;

  /** Subscribe to engine state changes. Returns unsubscribe. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  /** Lazily construct the AudioContext. Browsers require a user gesture
   *  before audio can play, so init() is meant to be called in response
   *  to a click — the workspace calls it from the first transport action. */
  init(): boolean {
    if (this.ctx) return true;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor({
        latencyHint: this.transport.latencyMode === "recording" ? "interactive" : "playback",
      });
      this.master = this.ctx.createGain();
      this.master.gain.value = DB_TO_LINEAR(this.transport.masterDb);
      // Master EQ — three biquads matching the per-track EQ shape so the
      // user thinks in the same units everywhere.
      this.masterEqLow = this.ctx.createBiquadFilter();
      this.masterEqLow.type = "lowshelf";
      this.masterEqLow.frequency.value = 200;
      this.masterEqMid = this.ctx.createBiquadFilter();
      this.masterEqMid.type = "peaking";
      this.masterEqMid.frequency.value = 1000;
      this.masterEqMid.Q.value = 1;
      this.masterEqHigh = this.ctx.createBiquadFilter();
      this.masterEqHigh.type = "highshelf";
      this.masterEqHigh.frequency.value = 5000;
      // Master limiter — DynamicsCompressor in "brick wall" mode. We
      // route all signal through it (knee=0, ratio=20, fast attack) so
      // a hot mix can't clip the destination. The user can disable it
      // for an honest peak-to-peak listen.
      this.masterLimiter = this.ctx.createDynamicsCompressor();
      this.masterLimiter.threshold.value = -3;
      this.masterLimiter.knee.value = 0;
      this.masterLimiter.ratio.value = 20;
      this.masterLimiter.attack.value = 0.002;
      this.masterLimiter.release.value = 0.05;
      this.masterAnalyser = this.ctx.createAnalyser();
      this.masterAnalyser.fftSize = 512;
      this.masterMeterBuf = new Uint8Array(this.masterAnalyser.fftSize);
      // Spectrum analyser — wider FFT for finer resolution.
      this.masterSpectrumAnalyser = this.ctx.createAnalyser();
      this.masterSpectrumAnalyser.fftSize = 2048;
      this.masterSpectrumAnalyser.smoothingTimeConstant = 0.75;
      this.masterSpectrumBuf = new Uint8Array(
        this.masterSpectrumAnalyser.frequencyBinCount,
      );
      // LUFS branch — same analyser, K-weighting via two biquads. Routed
      // post-EQ-pre-limiter so the loudness reading reflects what the user
      // tonally hears rather than what the limiter clamps.
      const lufsHpf = this.ctx.createBiquadFilter();
      lufsHpf.type = "highpass";
      lufsHpf.frequency.value = 38;
      const lufsShelf = this.ctx.createBiquadFilter();
      lufsShelf.type = "highshelf";
      lufsShelf.frequency.value = 1500;
      lufsShelf.gain.value = 4;
      this.lufsAnalyser = this.ctx.createAnalyser();
      this.lufsAnalyser.fftSize = 2048;
      this.lufsBuf = new Float32Array(this.lufsAnalyser.fftSize);
      // Wire master chain.
      this.master
        .connect(this.masterEqLow)
        .connect(this.masterEqMid)
        .connect(this.masterEqHigh)
        .connect(this.masterLimiter)
        .connect(this.masterAnalyser);
      this.masterAnalyser.connect(this.ctx.destination);
      // Side branches — both tap the post-EQ signal so their readings
      // reflect what we route to the speakers.
      this.masterEqHigh.connect(this.masterSpectrumAnalyser);
      this.masterEqHigh.connect(lufsHpf).connect(lufsShelf).connect(this.lufsAnalyser);
      // Shared aux returns. Tracks send into these busses instead of
      // instantiating a reverb/delay processor per track.
      this.reverbReturnIn = this.ctx.createGain();
      this.reverbConvolver = this.ctx.createConvolver();
      this.reverbConvolver.buffer = this.buildReverbIr(this.aux.reverbReturn.decaySec);
      this.reverbReturnGain = this.ctx.createGain();
      this.reverbReturnGain.gain.value = this.aux.reverbReturn.level;
      this.reverbReturnIn
        .connect(this.reverbConvolver)
        .connect(this.reverbReturnGain)
        .connect(this.master);

      this.delayReturnIn = this.ctx.createGain();
      this.delay = this.ctx.createDelay(4.0);
      this.delay.delayTime.value = (60 / this.transport.bpm) * this.aux.delayReturn.beats;
      this.delayFeedback = this.ctx.createGain();
      this.delayFeedback.gain.value = this.aux.delayReturn.feedback;
      this.delayReturnGain = this.ctx.createGain();
      this.delayReturnGain.gain.value = this.aux.delayReturn.level;
      this.delayReturnIn.connect(this.delay);
      this.delay.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delay);
      this.delay.connect(this.delayReturnGain).connect(this.master);
      // Metronome chain — small click oscillator gated by an envelope.
      this.metronomeGain = this.ctx.createGain();
      this.metronomeGain.gain.value = 0;
      this.metronomeGain.connect(this.master);
      this.startMeterLoop();
      return true;
    } catch (err) {
      console.warn("[DawEngine] init failed", err);
      return false;
    }
  }

  private startMeterLoop() {
    const step = () => {
      if (!this.ctx) return;
      this.tick();
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  private tick() {
    if (!this.ctx || !this.masterAnalyser || !this.masterMeterBuf) return;
    // Master meter: peak amplitude in current buffer.
    this.masterAnalyser.getByteTimeDomainData(
      this.masterMeterBuf as unknown as Uint8Array<ArrayBuffer>,
    );
    let peak = 0;
    for (let i = 0; i < this.masterMeterBuf.length; i++) {
      const v = Math.abs((this.masterMeterBuf[i] ?? 128) - 128) / 128;
      if (v > peak) peak = v;
    }
    this.transport.masterLevel = peak;

    // Per-track meters.
    for (const t of this.tracks.values()) {
      t.meterAnalyser.getByteTimeDomainData(
        t.meterBuf as unknown as Uint8Array<ArrayBuffer>,
      );
      let trackPeak = 0;
      for (let i = 0; i < t.meterBuf.length; i++) {
        const v = Math.abs((t.meterBuf[i] ?? 128) - 128) / 128;
        if (v > trackPeak) trackPeak = v;
      }
      t.state.level = trackPeak;
    }

    // Sidechain ducking — drive each target track's duck-gain from the
    // source track's level. Level is already updated above so we read
    // post-meter. Reduction = sourceLevel * sidechainAmount, clamped to
    // [0, 0.95] so we never fully silence (jarring). Smoothing matches
    // a typical sidechain release curve.
    for (const t of this.tracks.values()) {
      if (!t.state.sidechainFromId) {
        // Lerp gain back to 1.0 if we previously ducked then disabled.
        const cur = t.sidechainDuck.gain.value;
        if (cur < 0.999) {
          t.sidechainDuck.gain.value = cur + (1 - cur) * 0.2;
        }
        continue;
      }
      const src = this.tracks.get(t.state.sidechainFromId);
      if (!src) continue;
      const reduction = Math.min(0.95, src.state.level * t.state.sidechainAmount * 1.4);
      const targetGain = 1 - reduction;
      // Asymmetric — fast attack on duck, slow release. Reads as "pump."
      const cur = t.sidechainDuck.gain.value;
      if (targetGain < cur) {
        t.sidechainDuck.gain.value = cur * 0.5 + targetGain * 0.5;
      } else {
        t.sidechainDuck.gain.value = cur * 0.85 + targetGain * 0.15;
      }
    }

    // Master spectrum + LUFS + true-peak.
    if (this.masterSpectrumAnalyser && this.masterSpectrumBuf) {
      this.masterSpectrumAnalyser.getByteFrequencyData(
        this.masterSpectrumBuf as unknown as Uint8Array<ArrayBuffer>,
      );
      // Aggregate the FFT into 32 log-spaced bins so the UI bar count is
      // small and stable across screen sizes.
      const totalBins = this.masterSpectrumBuf.length;
      const out: number[] = [];
      for (let i = 0; i < 32; i++) {
        const lo = Math.floor(Math.pow(i / 32, 2) * totalBins);
        const hi = Math.floor(Math.pow((i + 1) / 32, 2) * totalBins);
        let v = 0;
        for (let j = lo; j < Math.max(lo + 1, hi); j++) {
          v = Math.max(v, this.masterSpectrumBuf[j] ?? 0);
        }
        out.push(v / 255);
      }
      this.transport.masterSpectrum = out;
    }
    if (this.lufsAnalyser && this.lufsBuf) {
      this.lufsAnalyser.getFloatTimeDomainData(
        this.lufsBuf as unknown as Float32Array<ArrayBuffer>,
      );
      let sumSq = 0;
      let truePeak = 0;
      for (let i = 0; i < this.lufsBuf.length; i++) {
        const v = this.lufsBuf[i] ?? 0;
        sumSq += v * v;
        const a = Math.abs(v);
        if (a > truePeak) truePeak = a;
      }
      const rms = Math.sqrt(sumSq / this.lufsBuf.length);
      // LUFS approximation. -0.691 is the K-weighted offset baseline.
      this.transport.masterLufs = rms > 0 ? -0.691 + 10 * Math.log10(rms * rms) : -Infinity;
      this.transport.masterTruePeak = truePeak;
    }

    // Update transport position when playing.
    if (this.transport.isPlaying) {
      const elapsed = Math.max(0, this.ctx.currentTime - this.playStartCtxTime);
      this.transport.positionSec = this.playStartPosition + elapsed;

      // Loop region: when position crosses the end point, jump back to
      // the start point and re-arm sources. Tiny audible gap (~5ms scheduling
      // latency); good enough for practice / composition.
      if (
        this.transport.loopEnabled &&
        this.transport.loopEndSec > this.transport.loopStartSec &&
        this.transport.positionSec >= this.transport.loopEndSec
      ) {
        this.transport.positionSec = this.transport.loopStartSec;
        // Re-trigger sources from the loop start. play() honors current position.
        this.stopSourcesOnly();
        void this.play();
        return; // play() called notify
      }
    }

    this.notify();
  }

  /** Stop just the buffer sources without flipping isPlaying. Used by
   *  the loop wrap-around, which needs to re-call play() immediately. */
  private stopSourcesOnly() {
    if (!this.ctx) return;
    for (const t of this.tracks.values()) {
      try {
        t.source?.stop();
      } catch {
        /* may already be stopped */
      }
      t.source = null;
    }
    this.transport.isPlaying = false;
    this.stopBeatScheduler();
  }

  // ── Tracks ────────────────────────────────────────────────────────────

  addTrack(name: string, color: string): TrackId {
    if (!this.ctx || !this.master) {
      throw new Error("Engine not initialized");
    }
    const ctx = this.ctx;
    const id = `t_${Math.random().toString(36).slice(2, 9)}`;

    // Build the track strip. Defaults are flat — user dialing EQ/comp
    // before recording will hear the same path on monitoring and playback.
    const fxIn = ctx.createGain();
    // Sidechain duck — sits between fxIn and the rest of the strip.
    // Modulated each tick when sidechainFromId is set.
    const sidechainDuck = ctx.createGain();
    sidechainDuck.gain.value = 1;
    const eqLow = ctx.createBiquadFilter();
    eqLow.type = "lowshelf";
    eqLow.frequency.value = 200;
    const eqMid = ctx.createBiquadFilter();
    eqMid.type = "peaking";
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 1;
    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = "highshelf";
    eqHigh.frequency.value = 5000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.knee.value = 6;
    comp.attack.value = 0.005;
    comp.release.value = 0.1;
    // Comp bypass: we drive both `comp` and a unity gain in parallel,
    // and crossfade. Cleaner than reconnecting nodes mid-stream.
    const compBypass = ctx.createGain();
    compBypass.gain.value = 0; // start with bypass closed → comp engaged
    const compMix = ctx.createGain();

    const reverbSendGain = ctx.createGain();
    reverbSendGain.gain.value = 0;
    const delaySendGain = ctx.createGain();
    delaySendGain.gain.value = 0;

    const gainNode = ctx.createGain();
    const panNode = ctx.createStereoPanner();
    const meterAnalyser = ctx.createAnalyser();
    meterAnalyser.fftSize = 256;
    const meterBuf = new Uint8Array(meterAnalyser.fftSize);

    // Wire FX chain.
    fxIn.connect(sidechainDuck);
    sidechainDuck.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(comp);
    eqHigh.connect(compBypass); // parallel bypass path
    comp.connect(compMix);
    compBypass.connect(compMix);
    // Out the strip → fader / pan / meter / master. Time-based FX are
    // post-fader sends to shared aux returns.
    compMix.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(meterAnalyser);
    meterAnalyser.connect(this.master);
    panNode.connect(reverbSendGain);
    panNode.connect(delaySendGain);
    if (this.reverbReturnIn) reverbSendGain.connect(this.reverbReturnIn);
    if (this.delayReturnIn) delaySendGain.connect(this.delayReturnIn);

    const t: TrackInternal = {
      state: {
        id,
        name,
        color,
        gainDb: 0,
        pan: 0,
        muted: false,
        solo: false,
        armed: false,
        monitorEnabled: false,
        hasAudio: false,
        durationSec: 0,
        level: 0,
        fx: {
          eqLowDb: 0,
          eqMidDb: 0,
          eqHighDb: 0,
          compEnabled: true,
          compThreshDb: -18,
          compRatio: 3,
          reverbWet: 0,
          reverbDecaySec: 2.5,
          delayWet: 0,
          delayBeats: 0.5,
          delayFeedback: 0.35,
        },
        sidechainFromId: null,
        sidechainAmount: 0.6,
      },
      fxIn,
      sidechainDuck,
      eqLow,
      eqMid,
      eqHigh,
      comp,
      compBypass,
      compMix,
      reverbSendGain,
      delaySendGain,
      gainNode,
      panNode,
      meterAnalyser,
      meterBuf,
      buffer: null,
      blob: null,
      source: null,
      liveSource: null,
      liveStream: null,
      monitorGain: null,
      recorder: null,
      recordedChunks: [],
    };
    this.tracks.set(id, t);
    this.notify();
    return id;
  }

  /**
   * Build a synthetic exponential-decay reverb impulse response. Enough
   * for a usable plate/hall character without bundling IR audio files.
   */
  private buildReverbIr(decaySec: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * decaySec));
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      }
    }
    return ir;
  }

  // ── FX setters ────────────────────────────────────────────────────────

  setTrackEq(id: TrackId, band: "low" | "mid" | "high", db: number) {
    const t = this.tracks.get(id);
    if (!t) return;
    const clamped = Math.max(-12, Math.min(12, db));
    if (band === "low") {
      t.state.fx.eqLowDb = clamped;
      t.eqLow.gain.value = clamped;
    } else if (band === "mid") {
      t.state.fx.eqMidDb = clamped;
      t.eqMid.gain.value = clamped;
    } else {
      t.state.fx.eqHighDb = clamped;
      t.eqHigh.gain.value = clamped;
    }
    this.notify();
  }

  setTrackComp(id: TrackId, params: { threshDb?: number; ratio?: number; enabled?: boolean }) {
    const t = this.tracks.get(id);
    if (!t) return;
    if (params.threshDb !== undefined) {
      const clamped = Math.max(-60, Math.min(0, params.threshDb));
      t.state.fx.compThreshDb = clamped;
      t.comp.threshold.value = clamped;
    }
    if (params.ratio !== undefined) {
      const clamped = Math.max(1, Math.min(20, params.ratio));
      t.state.fx.compRatio = clamped;
      t.comp.ratio.value = clamped;
    }
    if (params.enabled !== undefined) {
      t.state.fx.compEnabled = params.enabled;
      // Crossfade comp ↔ bypass over 20ms to avoid a click on toggle.
      const now = this.ctx!.currentTime;
      if (params.enabled) {
        t.compMix.gain.cancelScheduledValues(now);
        t.compBypass.gain.linearRampToValueAtTime(0, now + 0.02);
      } else {
        t.compBypass.gain.cancelScheduledValues(now);
        t.compBypass.gain.linearRampToValueAtTime(1, now + 0.02);
      }
    }
    this.notify();
  }

  setTrackReverb(id: TrackId, params: { wet?: number; decaySec?: number }) {
    const t = this.tracks.get(id);
    if (!t || !this.ctx) return;
    if (params.wet !== undefined) {
      const clamped = Math.max(0, Math.min(1, params.wet));
      t.state.fx.reverbWet = clamped;
      t.reverbSendGain.gain.value = clamped;
    }
    if (params.decaySec !== undefined) {
      const clamped = Math.max(0.2, Math.min(6, params.decaySec));
      t.state.fx.reverbDecaySec = clamped;
      this.aux.reverbReturn.decaySec = clamped;
      if (this.reverbConvolver) {
        this.reverbConvolver.buffer = this.buildReverbIr(clamped);
      }
    }
    this.notify();
  }

  setTrackDelay(id: TrackId, params: { wet?: number; beats?: number; feedback?: number }) {
    const t = this.tracks.get(id);
    if (!t) return;
    if (params.wet !== undefined) {
      const clamped = Math.max(0, Math.min(1, params.wet));
      t.state.fx.delayWet = clamped;
      t.delaySendGain.gain.value = clamped;
    }
    if (params.beats !== undefined) {
      const clamped = Math.max(0.0625, Math.min(4, params.beats));
      t.state.fx.delayBeats = clamped;
      this.aux.delayReturn.beats = clamped;
      if (this.delay) this.delay.delayTime.value = (60 / this.transport.bpm) * clamped;
    }
    if (params.feedback !== undefined) {
      const clamped = Math.max(0, Math.min(0.85, params.feedback));
      t.state.fx.delayFeedback = clamped;
      this.aux.delayReturn.feedback = clamped;
      if (this.delayFeedback) this.delayFeedback.gain.value = clamped;
    }
    this.notify();
  }

  /**
   * Toggle live monitoring (the "hear yourself" path while recording) for
   * a single track. The monitor gain fades up/down over 30 ms so the user
   * doesn't hear a click — this matters because monitor toggling typically
   * happens *during* an armed take and a snap to silence/full-volume is
   * jarring.
   *
   * IMPORTANT: enabling monitor without headphones will create a feedback
   * loop. The DAW UI should always confirm headphones first before calling
   * this with `on=true`. The engine itself does not enforce that — it just
   * provides the gate.
   */
  setTrackMonitor(id: TrackId, on: boolean) {
    const t = this.tracks.get(id);
    if (!t || !this.ctx) return;
    t.state.monitorEnabled = on;
    if (t.monitorGain) {
      const target = on ? 1 : 0;
      const now = this.ctx.currentTime;
      // Cancel any in-flight ramp before starting a new one — otherwise
      // rapid toggles compound into surprising values.
      t.monitorGain.gain.cancelScheduledValues(now);
      t.monitorGain.gain.setValueAtTime(t.monitorGain.gain.value, now);
      t.monitorGain.gain.linearRampToValueAtTime(target, now + 0.03);
    }
    this.notify();
  }

  // ── Track audio I/O — programmatic buffer attach (used by beat render) ───

  /** Attach an AudioBuffer to a track without going through MediaRecorder.
   *  Used by the beat machine "Render to Beat track" flow. */
  setTrackBuffer(id: TrackId, buf: AudioBuffer) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.buffer = buf;
    t.state.hasAudio = true;
    t.state.durationSec = buf.duration;
    // Stale waveform peaks would render the wrong shape over the new audio.
    this.waveformCache.delete(id);
    this.notify();
  }

  setTrackGainDb(id: TrackId, db: number) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.state.gainDb = db;
    t.gainNode.gain.value = t.state.muted ? 0 : DB_TO_LINEAR(db);
    this.notify();
  }

  setTrackPan(id: TrackId, pan: number) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.state.pan = pan;
    t.panNode.pan.value = pan;
    this.notify();
  }

  setTrackMute(id: TrackId, muted: boolean) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.state.muted = muted;
    this.applySoloMuteRouting();
    this.notify();
  }

  setTrackSolo(id: TrackId, solo: boolean) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.state.solo = solo;
    this.applySoloMuteRouting();
    this.notify();
  }

  setTrackArmed(id: TrackId, armed: boolean) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.state.armed = armed;
    this.notify();
  }

  /** When ANY track is solo'd, only solo'd tracks should be audible.
   *  Otherwise muted state controls audibility. Recompute every track's
   *  effective gain whenever solo/mute state changes. */
  private applySoloMuteRouting() {
    const anySolo = Array.from(this.tracks.values()).some((t) => t.state.solo);
    for (const t of this.tracks.values()) {
      const audible = anySolo ? t.state.solo : !t.state.muted;
      t.gainNode.gain.value = audible ? DB_TO_LINEAR(t.state.gainDb) : 0;
    }
  }

  // ── Master ────────────────────────────────────────────────────────────

  setMasterDb(db: number) {
    if (!this.master) return;
    this.transport.masterDb = db;
    this.master.gain.value = DB_TO_LINEAR(db);
    this.notify();
  }

  setBpm(bpm: number) {
    this.transport.bpm = Math.max(40, Math.min(240, Math.round(bpm)));
    // Re-derive shared delay return time from the new BPM so beat-locked
    // delay stays locked. Reverb and EQ are tempo-independent, no change.
    if (this.delay) {
      this.delay.delayTime.value = (60 / this.transport.bpm) * this.aux.delayReturn.beats;
    }
    this.notify();
  }

  setLatencyMode(mode: TransportState["latencyMode"]) {
    this.transport.latencyMode = mode;
    this.notify();
  }

  setVocalCaptureProfile(profile: TransportState["vocalCaptureProfile"]) {
    this.transport.vocalCaptureProfile = profile;
    this.notify();
  }

  // ── Aux bus return setters ─────────────────────────────────────────────

  setAuxReverbLevel(level: number) {
    const clamped = Math.max(0, Math.min(2, level));
    this.aux.reverbReturn.level = clamped;
    if (this.reverbReturnGain) this.reverbReturnGain.gain.value = clamped;
    this.notify();
  }
  setAuxReverbDecay(decaySec: number) {
    const clamped = Math.max(0.2, Math.min(6, decaySec));
    this.aux.reverbReturn.decaySec = clamped;
    if (this.reverbConvolver) {
      this.reverbConvolver.buffer = this.buildReverbIr(clamped);
    }
    this.notify();
  }
  setAuxDelayLevel(level: number) {
    const clamped = Math.max(0, Math.min(2, level));
    this.aux.delayReturn.level = clamped;
    if (this.delayReturnGain) this.delayReturnGain.gain.value = clamped;
    this.notify();
  }
  setAuxDelayBeats(beats: number) {
    const clamped = Math.max(0.0625, Math.min(4, beats));
    this.aux.delayReturn.beats = clamped;
    if (this.delay) this.delay.delayTime.value = (60 / this.transport.bpm) * clamped;
    this.notify();
  }
  setAuxDelayFeedback(feedback: number) {
    const clamped = Math.max(0, Math.min(0.85, feedback));
    this.aux.delayReturn.feedback = clamped;
    if (this.delayFeedback) this.delayFeedback.gain.value = clamped;
    this.notify();
  }

  setMasterLimiter(on: boolean) {
    this.transport.masterLimiterOn = on;
    if (!this.masterLimiter) return;
    // Slacken the limiter into a no-op when off (threshold > 0, ratio
    // 1) rather than rewiring the graph mid-stream — much smoother.
    if (on) {
      this.masterLimiter.threshold.value = -3;
      this.masterLimiter.ratio.value = 20;
    } else {
      this.masterLimiter.threshold.value = 0;
      this.masterLimiter.ratio.value = 1;
    }
    this.notify();
  }

  /** Set one band of the master EQ in dB. Same shape as track EQ. */
  setMasterEq(band: "low" | "mid" | "high", db: number) {
    const clamped = Math.max(-12, Math.min(12, db));
    if (band === "low") {
      this.transport.masterEqLowDb = clamped;
      if (this.masterEqLow) this.masterEqLow.gain.value = clamped;
    } else if (band === "mid") {
      this.transport.masterEqMidDb = clamped;
      if (this.masterEqMid) this.masterEqMid.gain.value = clamped;
    } else {
      this.transport.masterEqHighDb = clamped;
      if (this.masterEqHigh) this.masterEqHigh.gain.value = clamped;
    }
    this.notify();
  }

  // ── Sidechain ─────────────────────────────────────────────────────────

  setTrackSidechain(targetId: TrackId, sourceId: TrackId | null, amount?: number) {
    const t = this.tracks.get(targetId);
    if (!t) return;
    // Disallow self-sidechain — would feedback the meter.
    if (sourceId === targetId) sourceId = null;
    t.state.sidechainFromId = sourceId;
    if (amount !== undefined) {
      t.state.sidechainAmount = Math.max(0, Math.min(1, amount));
    }
    if (!sourceId) {
      // Re-open the duck immediately so the user hears the change.
      t.sidechainDuck.gain.value = 1;
    }
    this.notify();
  }

  // ── Track add / rename ────────────────────────────────────────────────

  renameTrack(id: TrackId, name: string) {
    const t = this.tracks.get(id);
    if (!t) return;
    const trimmed = name.trim().slice(0, 24);
    if (!trimmed) return;
    t.state.name = trimmed;
    this.notify();
  }

  setMetronome(on: boolean) {
    this.transport.metronomeOn = on;
    if (on && this.transport.isPlaying) {
      this.scheduleMetronomeTicks();
    } else {
      this.stopMetronome();
    }
    this.notify();
  }

  private scheduleMetronomeTicks() {
    if (!this.ctx || !this.metronomeGain) return;
    const ctx = this.ctx;
    const gain = this.metronomeGain;
    const beatSec = 60 / this.transport.bpm;
    this.metronomeNextTime = ctx.currentTime + 0.05;

    const fire = () => {
      if (!this.transport.metronomeOn || !this.transport.isPlaying) {
        this.metronomeTimerId = null;
        return;
      }
      while (this.metronomeNextTime < ctx.currentTime + 0.2) {
        const osc = ctx.createOscillator();
        osc.frequency.value = 1000;
        osc.connect(gain);
        const t0 = this.metronomeNextTime;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.4, t0 + 0.001);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
        osc.start(t0);
        osc.stop(t0 + 0.06);
        this.metronomeNextTime += beatSec;
      }
      this.metronomeTimerId = window.setTimeout(fire, 25);
    };
    fire();
  }

  private stopMetronome() {
    if (this.metronomeTimerId !== null) {
      clearTimeout(this.metronomeTimerId);
      this.metronomeTimerId = null;
    }
  }

  // ── Transport ─────────────────────────────────────────────────────────

  async play(): Promise<void> {
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        return;
      }
    }
    if (this.transport.isPlaying) return;

    const startAt = this.ctx.currentTime + TRANSPORT_START_LEAD_SEC;
    const offset = this.transport.positionSec;
    for (const t of this.tracks.values()) {
      if (!t.buffer) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = t.buffer;
      // Sources go in at fxIn (top of chain) so playback gets the same
      // EQ / Comp / Reverb / Delay treatment as live monitoring.
      src.connect(t.fxIn);
      try {
        src.start(startAt, Math.max(0, offset));
      } catch {
        /* offset past buffer end — silent */
      }
      t.source = src;
    }
    this.playStartCtxTime = startAt;
    this.playStartPosition = offset;
    this.transport.isPlaying = true;
    if (this.transport.metronomeOn) this.scheduleMetronomeTicks();
    if (this.beatMachine.enabled) this.scheduleBeatTicks();
    if (this.midi.clip) this.scheduleMidiClipTicks();
    this.notify();
  }

  stop() {
    if (!this.ctx) return;
    for (const t of this.tracks.values()) {
      try {
        t.source?.stop();
      } catch {
        /* may already be stopped */
      }
      t.source = null;
    }
    this.transport.isPlaying = false;
    this.stopMetronome();
    this.stopBeatScheduler();
    this.stopMidiClipScheduler();
    this.beatMachine.activeStep = -1;
    this.notify();
  }

  rewind() {
    this.stop();
    this.transport.positionSec = 0;
    this.notify();
  }

  /** Jump the playhead to a specific time. Re-triggers sources if currently
   *  playing so the new position takes effect immediately. */
  seek(positionSec: number) {
    const wasPlaying = this.transport.isPlaying;
    if (wasPlaying) this.stop();
    this.transport.positionSec = Math.max(0, positionSec);
    if (wasPlaying) void this.play();
    else this.notify();
  }

  // ── Loop region ───────────────────────────────────────────────────────

  setLoopRegion(startSec: number, endSec: number) {
    const start = Math.max(0, startSec);
    // Minimum loop length 0.25s — anything smaller and the wrap-around
    // logic re-triggers faster than the audio scheduler can react and
    // you get a stutter instead of a loop.
    const end = Math.max(start + 0.25, endSec);
    this.transport.loopStartSec = start;
    this.transport.loopEndSec = end;
    this.notify();
  }

  setLoopEnabled(enabled: boolean) {
    this.transport.loopEnabled = enabled;
    // If enabling and the playhead is outside the loop, snap it in.
    if (
      enabled &&
      (this.transport.positionSec < this.transport.loopStartSec ||
        this.transport.positionSec >= this.transport.loopEndSec)
    ) {
      this.seek(this.transport.loopStartSec);
    } else {
      this.notify();
    }
  }

  // ── Tap tempo ─────────────────────────────────────────────────────────

  /** Record a tap and recompute BPM from recent intervals. Returns the
   *  resulting BPM so the UI can flash a confirmation without re-reading
   *  the snapshot. Median (not mean) so a stray bad tap doesn't poison
   *  the result. Window resets after 1.5s of no taps. */
  tapTempo(): number | null {
    const now = Date.now();
    const last = this.tapTimestamps[this.tapTimestamps.length - 1];
    if (last !== undefined && now - last > 1500) {
      // Long pause → start a fresh tap window.
      this.tapTimestamps = [];
    }
    this.tapTimestamps.push(now);
    if (this.tapTimestamps.length > 8) {
      this.tapTimestamps.shift();
    }
    if (this.tapTimestamps.length < 2) return null;

    const intervals: number[] = [];
    for (let i = 1; i < this.tapTimestamps.length; i++) {
      intervals.push(this.tapTimestamps[i]! - this.tapTimestamps[i - 1]!);
    }
    intervals.sort((a, b) => a - b);
    const medianMs = intervals[Math.floor(intervals.length / 2)] ?? 500;
    const bpm = Math.round(60000 / medianMs);
    if (bpm >= 40 && bpm <= 240) {
      this.setBpm(bpm);
      return bpm;
    }
    return null;
  }

  // ── File import ────────────────────────────────────────────────────────

  /** Load an audio file (mp3/wav/m4a/flac/webm/ogg…) into a track. The
   *  browser's decodeAudioData handles every common format. Returns
   *  true on success, false if decoding failed. */
  async importAudioFile(trackId: TrackId, file: Blob): Promise<boolean> {
    if (!this.ctx) return false;
    const t = this.tracks.get(trackId);
    if (!t) return false;
    try {
      const arr = await file.arrayBuffer();
      const buffer = await this.ctx.decodeAudioData(arr);
      t.buffer = buffer;
      t.blob = file instanceof Blob ? file : null;
      t.state.hasAudio = true;
      t.state.durationSec = buffer.duration;
      this.waveformCache.delete(trackId);
      this.notify();
      return true;
    } catch (err) {
      console.warn("[DawEngine] importAudioFile decode failed", err);
      return false;
    }
  }

  // ── Waveform peaks (UI helper) ─────────────────────────────────────────

  /** Return a downsampled peak array for the supplied track, suitable
   *  for rendering a static waveform display. Cached — bins parameter
   *  is honored on first call only; subsequent calls return the cached
   *  array even if bins changes. Cheap to call from a useMemo. */
  getWaveformPeaks(trackId: TrackId, bins: number = 200): number[] {
    const cached = this.waveformCache.get(trackId);
    if (cached) return cached;
    const t = this.tracks.get(trackId);
    if (!t || !t.buffer) return [];
    const data = t.buffer.getChannelData(0);
    const samplesPerBin = Math.max(1, Math.floor(data.length / bins));
    const peaks: number[] = [];
    for (let i = 0; i < bins; i++) {
      const start = i * samplesPerBin;
      const end = Math.min(data.length, start + samplesPerBin);
      let peak = 0;
      for (let j = start; j < end; j++) {
        const v = Math.abs(data[j] ?? 0);
        if (v > peak) peak = v;
      }
      peaks.push(peak);
    }
    this.waveformCache.set(trackId, peaks);
    return peaks;
  }

  // ── Recording ─────────────────────────────────────────────────────────

  /** Request mic permission and start recording into the FIRST armed
   *  track (or the supplied trackId). Returns false if mic permission
   *  was denied or no track is armed. */
  async startRecording(trackId?: TrackId): Promise<boolean> {
    if (!this.ctx) return false;
    const wasPlaying = this.transport.isPlaying;
    const track =
      (trackId ? this.tracks.get(trackId) : null) ??
      Array.from(this.tracks.values()).find((t) => t.state.armed);
    if (!track) return false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: this.ctx.sampleRate,
          sampleSize: 16,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      track.liveStream = stream;

      // Live mic → monitorGain → fxIn (top of FX chain). The monitor gain
      // starts at 0 so the performer does NOT hear themselves through the
      // speakers by default — that's what creates the recording feedback
      // loop when no headphones are plugged in. The DAW UI surfaces a
      // "Turn on monitor" toggle that explicitly warns the user to wear
      // headphones first; flipping it calls setTrackMonitor() which fades
      // the gain up over 30ms to avoid clicks. Recording is unaffected:
      // MediaRecorder reads the raw stream, not the monitor path.
      const live = this.ctx.createMediaStreamSource(stream);
      const monitorGain = this.ctx.createGain();
      monitorGain.gain.value = track.state.monitorEnabled ? 1 : 0;
      live.connect(monitorGain);
      monitorGain.connect(track.fxIn);
      track.liveSource = live;
      track.monitorGain = monitorGain;

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      track.recordedChunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) track.recordedChunks.push(e.data);
      };
      recorder.start(100);
      track.recorder = recorder;

      this.transport.isRecording = true;
      this.recordingAlignmentTrimSec = wasPlaying ? 0 : TRANSPORT_START_LEAD_SEC;
      this.notify();
      // Fire-and-forget play — recording while transport runs lets the
      // performer hear backing tracks. If init failed earlier, play() is
      // a no-op.
      if (!wasPlaying) void this.play();
      return true;
    } catch (err) {
      console.warn("[DawEngine] recording init failed", err);
      // Clean up any partial state.
      if (track.liveStream) {
        track.liveStream.getTracks().forEach((t) => t.stop());
        track.liveStream = null;
      }
      track.liveSource?.disconnect();
      track.liveSource = null;
      track.monitorGain?.disconnect();
      track.monitorGain = null;
      this.transport.isRecording = false;
      this.recordingAlignmentTrimSec = 0;
      this.notify();
      return false;
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.ctx) return;
    const recordingTrack = Array.from(this.tracks.values()).find(
      (t) => t.recorder,
    );
    if (!recordingTrack) {
      this.transport.isRecording = false;
      this.notify();
      return;
    }
    const ctx = this.ctx;

    // Stop the recorder and wait for the final dataavailable.
    await new Promise<void>((resolve) => {
      const r = recordingTrack.recorder!;
      r.onstop = () => resolve();
      try {
        r.stop();
      } catch {
        resolve();
      }
    });

    // Tear down live monitor + stream.
    recordingTrack.liveSource?.disconnect();
    recordingTrack.liveSource = null;
    recordingTrack.monitorGain?.disconnect();
    recordingTrack.monitorGain = null;
    recordingTrack.liveStream?.getTracks().forEach((t) => t.stop());
    recordingTrack.liveStream = null;
    recordingTrack.recorder = null;

    const blob = new Blob(recordingTrack.recordedChunks, {
      type: "audio/webm",
    });
    recordingTrack.blob = blob;
    try {
      const arrayBuf = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      const onsetTrimSec =
        this.transport.vocalCaptureProfile === "raw"
          ? this.recordingAlignmentTrimSec
          : this.estimateOnsetTrimSec(decoded, this.recordingAlignmentTrimSec);
      const aligned = this.trimBufferStart(decoded, onsetTrimSec);
      recordingTrack.buffer = this.normalizeRecordedBuffer(aligned);
      recordingTrack.state.hasAudio = true;
      this.waveformCache.delete(recordingTrack.state.id);
      recordingTrack.state.durationSec = recordingTrack.buffer.duration;
    } catch (err) {
      console.warn("[DawEngine] decode failed", err);
    }

    this.transport.isRecording = false;
    this.recordingAlignmentTrimSec = 0;
    this.stop();
    this.transport.positionSec = 0;
    this.notify();
  }

  /** Trim N seconds from the front of a buffer, preserving channel count/rate. */
  private trimBufferStart(buffer: AudioBuffer, trimSec: number): AudioBuffer {
    if (!this.ctx) return buffer;
    const trimFrames = Math.max(0, Math.floor(trimSec * buffer.sampleRate));
    if (trimFrames <= 0 || trimFrames >= buffer.length - 1) return buffer;
    const out = this.ctx.createBuffer(
      buffer.numberOfChannels,
      buffer.length - trimFrames,
      buffer.sampleRate,
    );
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = out.getChannelData(ch);
      for (let i = 0; i < dst.length; i++) {
        dst[i] = src[i + trimFrames] ?? 0;
      }
    }
    return out;
  }

  /**
   * Estimate extra head trim from detected onset so takes align tighter to
   * the first intentional vocal transient without clipping consonants.
   */
  private estimateOnsetTrimSec(buffer: AudioBuffer, maxTrimSec: number): number {
    const clampedMax = Math.max(0, maxTrimSec);
    if (clampedMax <= 0) return 0;
    const first = buffer.getChannelData(0);
    if (!first || first.length < 32) return 0;

    const sampleRate = buffer.sampleRate;
    const window = Math.max(16, Math.floor(sampleRate * 0.003)); // ~3ms window
    const floorFrames = Math.min(first.length, Math.max(window, Math.floor(sampleRate * 0.04))); // 40ms
    let floorAcc = 0;
    for (let i = 0; i < floorFrames; i++) floorAcc += Math.abs(first[i] ?? 0);
    const noiseFloor = floorFrames > 0 ? floorAcc / floorFrames : 0;

    const threshold = Math.max(0.008, noiseFloor * 4);
    const maxFrames = Math.min(first.length - window, Math.floor(clampedMax * sampleRate));
    if (maxFrames <= 0) return 0;

    for (let i = 0; i < maxFrames; i += window) {
      let energy = 0;
      for (let j = 0; j < window; j++) {
        energy += Math.abs(first[i + j] ?? 0);
      }
      const avg = energy / window;
      if (avg >= threshold) {
        // Keep 4ms safety so plosives/consonants are not clipped.
        return Math.max(0, i / sampleRate - 0.004);
      }
    }
    return clampedMax;
  }

  /** Normalize recorded audio to a conservative target and remove DC offset. */
  private normalizeRecordedBuffer(buffer: AudioBuffer): AudioBuffer {
    if (!this.ctx) return buffer;
    const profile = this.transport.vocalCaptureProfile;
    let peak = 0;
    let rmsSq = 0;
    let rmsCount = 0;
    const channelMeans: number[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i] ?? 0;
        sum += v;
        rmsSq += v * v;
        rmsCount++;
        const a = Math.abs(v);
        if (a > peak) peak = a;
      }
      channelMeans[ch] = data.length > 0 ? sum / data.length : 0;
    }
    if (peak <= 0) return buffer;

    const rms = rmsCount > 0 ? Math.sqrt(rmsSq / rmsCount) : 0;
    let targetPeak = VOCAL_TARGET_PEAK;
    let gainCeiling = VOCAL_MAX_AUTO_GAIN;
    let gateThreshold = 0.0035;
    let gateAmount = 0.6;
    let saturate = false;

    if (profile === "raw") {
      targetPeak = 1;
      gainCeiling = 1;
      gateThreshold = 0;
      gateAmount = 1;
    } else if (profile === "punchy") {
      targetPeak = 0.86;
      gainCeiling = 1.6;
      gateThreshold = 0.002;
      gateAmount = 0.8;
      saturate = true;
    } else if (profile === "smooth") {
      targetPeak = rms > 0.16 ? 0.72 : 0.76;
      gainCeiling = 2.4;
      gateThreshold = 0.0045;
      gateAmount = 0.5;
    } else {
      targetPeak = rms > 0.18 ? 0.75 : VOCAL_TARGET_PEAK;
      gainCeiling = VOCAL_MAX_AUTO_GAIN;
      gateThreshold = 0.0035;
      gateAmount = 0.6;
    }

    const gain = Math.min(gainCeiling, targetPeak / Math.max(1e-6, peak));
    const out = this.ctx.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate,
    );
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = out.getChannelData(ch);
      const dc = channelMeans[ch] ?? 0;
      for (let i = 0; i < src.length; i++) {
        const dry = (src[i] ?? 0) - dc;
        // Keep low-level room tone natural, boost only intentional signal.
        const gate = gateThreshold > 0 && Math.abs(dry) < gateThreshold ? gateAmount : 1;
        const v = dry * gate;
        let shaped = Math.max(-1, Math.min(1, v * gain));
        if (saturate) {
          // Mild saturation keeps punchy mode forward without harsh clipping.
          shaped = Math.tanh(shaped * 1.12) / Math.tanh(1.12);
        }
        dst[i] = shaped;
      }

      // Short fades avoid clicks from trim/decode boundaries.
      const fadeFrames = Math.min(dst.length, Math.floor(buffer.sampleRate * 0.004));
      for (let i = 0; i < fadeFrames; i++) {
        const k = i / Math.max(1, fadeFrames);
        dst[i] *= k;
        const tailIdx = dst.length - 1 - i;
        if (tailIdx >= 0) dst[tailIdx] *= k;
      }
    }
    return out;
  }

  // ── Beat machine ───────────────────────────────────────────────────────

  /** Designate which track is the beat output. Drum hits scheduled by
   *  the sequencer route into this track's fxIn so they get the track
   *  strip's gain/pan/mute/solo + FX, like any other instrument. */
  setBeatTrack(id: TrackId) {
    if (this.tracks.has(id)) this.beatTrackId = id;
  }

  setBeatEnabled(enabled: boolean) {
    this.beatMachine.enabled = enabled;
    if (enabled && this.transport.isPlaying) this.scheduleBeatTicks();
    if (!enabled) {
      this.beatMachine.activeStep = -1;
      this.stopBeatScheduler();
    }
    this.notify();
  }

  setBeatStep(lane: DrumKind, step: number, on: boolean) {
    this.beatMachine.pattern[lane][step] = on;
    // Mirror into the active bank so a switch-and-back round-trips.
    this.beatMachine.bankPatterns[this.beatMachine.activeBank][lane][step] = on;
    this.notify();
  }

  setBeatPattern(pattern: BeatPattern) {
    this.beatMachine.pattern = pattern;
    this.beatMachine.bankPatterns[this.beatMachine.activeBank] = pattern;
    this.notify();
  }

  /** Switch the active pattern bank. Live tracks read from `pattern`
   *  which we point at the requested bank. */
  setActivePatternBank(bank: PatternBank) {
    if (bank === this.beatMachine.activeBank) return;
    // Persist any in-flight edits to the outgoing bank first — setBeatStep
    // mirrors but a hydrate / clear that bypasses it could leave drift.
    this.beatMachine.bankPatterns[this.beatMachine.activeBank] = this.beatMachine.pattern;
    this.beatMachine.activeBank = bank;
    this.beatMachine.pattern = this.beatMachine.bankPatterns[bank];
    this.notify();
  }

  setBeatKit(kit: DrumKitId) {
    this.beatMachine.kit = kit;
    this.notify();
  }

  /** Look-ahead beat scheduler — same pattern as the metronome. Walks
   *  forward 200ms in audio-context time and schedules every drum hit
   *  whose step bucket falls in that window. */
  private scheduleBeatTicks() {
    if (!this.ctx || !this.beatTrackId) return;
    const beatTrack = this.tracks.get(this.beatTrackId);
    if (!beatTrack) return;
    const ctx = this.ctx;
    const stepSec = () => 60 / this.transport.bpm / STEPS_PER_BEAT;

    this.beatNextTime = ctx.currentTime + 0.05;
    this.beatNextStep = 0;

    const fire = () => {
      if (!this.beatMachine.enabled || !this.transport.isPlaying) {
        this.beatTimerId = null;
        return;
      }
      while (this.beatNextTime < ctx.currentTime + 0.2) {
        const step = this.beatNextStep % STEPS;
        for (const lane of DRUM_LANES) {
          if (this.beatMachine.pattern[lane][step]) {
            scheduleDrumHit(ctx, beatTrack.fxIn, lane, {
              when: this.beatNextTime,
              kit: this.beatMachine.kit,
            });
          }
        }
        this.beatMachine.activeStep = step;
        this.beatNextTime += stepSec();
        this.beatNextStep++;
      }
      this.beatTimerId = window.setTimeout(fire, 25);
    };
    fire();
  }

  private stopBeatScheduler() {
    if (this.beatTimerId !== null) {
      clearTimeout(this.beatTimerId);
      this.beatTimerId = null;
    }
  }

  // ── Render & publish ──────────────────────────────────────────────────

  /**
   * Render the entire mix to an AudioBuffer offline. Replays every
   * track's buffer (and the beat pattern) through fresh FX chains in
   * an OfflineAudioContext, applying the same parameters the user
   * dialed in live. The resulting buffer is the "final mix."
   */
  async renderMix(options: RenderMixOptions = {}): Promise<AudioBuffer> {
    if (!this.ctx) throw new Error("Engine not initialized");

    const quality = options.quality ?? "standard";

    // Determine total duration: longest track, OR (if beat enabled) at
    // least one bar of the beat pattern at current BPM.
    let durationSec = 0;
    for (const t of this.tracks.values()) {
      if (t.buffer) durationSec = Math.max(durationSec, t.buffer.duration);
    }
    if (this.beatMachine.enabled) {
      const barSec = (60 / this.transport.bpm) * 4;
      durationSec = Math.max(durationSec, barSec);
    }
    if (durationSec === 0) durationSec = 1; // never zero-length
    durationSec += 1; // 1s tail for FX decays

    const sampleRate =
      quality === "ultra"
        ? Math.min(96000, Math.max(48000, this.ctx.sampleRate))
        : quality === "high"
          ? Math.min(48000, Math.max(44100, this.ctx.sampleRate))
          : this.ctx.sampleRate;
    const offline = new OfflineAudioContext(2, Math.ceil(durationSec * sampleRate), sampleRate);

    // Master chain in offline context — limiter mirrors the live one.
    const offMaster = offline.createGain();
    offMaster.gain.value = DB_TO_LINEAR(this.transport.masterDb);
    const offLimiter = offline.createDynamicsCompressor();
    if (this.transport.masterLimiterOn) {
      offLimiter.threshold.value = -3;
      offLimiter.ratio.value = 20;
    } else {
      offLimiter.threshold.value = 0;
      offLimiter.ratio.value = 1;
    }
    offLimiter.knee.value = 0;
    offLimiter.attack.value = 0.002;
    offLimiter.release.value = 0.05;
    offMaster.connect(offLimiter);
    offLimiter.connect(offline.destination);

    const offReverbIn = offline.createGain();
    const offReverb = offline.createConvolver();
    {
      const len = Math.max(1, Math.floor(offline.sampleRate * this.aux.reverbReturn.decaySec));
      const ir = offline.createBuffer(2, len, offline.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
        }
      }
      offReverb.buffer = ir;
    }
    const offReverbReturn = offline.createGain();
    offReverbReturn.gain.value = this.aux.reverbReturn.level;
    offReverbIn.connect(offReverb).connect(offReverbReturn).connect(offMaster);

    const offDelayIn = offline.createGain();
    const offDelay = offline.createDelay(4.0);
    offDelay.delayTime.value = (60 / this.transport.bpm) * this.aux.delayReturn.beats;
    const offDelayFeedback = offline.createGain();
    offDelayFeedback.gain.value = this.aux.delayReturn.feedback;
    const offDelayReturn = offline.createGain();
    offDelayReturn.gain.value = this.aux.delayReturn.level;
    offDelayIn.connect(offDelay);
    offDelay.connect(offDelayFeedback);
    offDelayFeedback.connect(offDelay);
    offDelay.connect(offDelayReturn).connect(offMaster);

    // Each live track gets a parallel FX chain in the offline context.
    const anySolo = Array.from(this.tracks.values()).some((t) => t.state.solo);
    for (const t of this.tracks.values()) {
      const audible = anySolo ? t.state.solo : !t.state.muted;
      if (!audible) continue;
      const chain = this.buildOfflineChain(offline, t.state);
      chain.outNode.connect(offMaster);
      chain.reverbSend.connect(offReverbIn);
      chain.delaySend.connect(offDelayIn);

      if (t.buffer) {
        const src = offline.createBufferSource();
        src.buffer = t.buffer;
        src.connect(chain.inNode);
        src.start(0);
      }
      // Beat machine output routes into this track's chain.
      if (this.beatMachine.enabled && this.beatTrackId === t.state.id) {
        const stepSec = 60 / this.transport.bpm / STEPS_PER_BEAT;
        for (let step = 0; step < STEPS; step++) {
          const when = step * stepSec;
          for (const lane of DRUM_LANES) {
            if (this.beatMachine.pattern[lane][step]) {
              scheduleDrumHit(offline, chain.inNode, lane, {
                when,
                kit: this.beatMachine.kit,
              });
            }
          }
        }
      }
    }
    return offline.startRendering();
  }

  /**
   * Construct an FX chain (EQ → comp → reverb → delay) inside an
   * OfflineAudioContext that mirrors the live track's parameter values.
   * Returns the input node (route source/drum hits in here) and the
   * output node (connect to master).
   */
  private buildOfflineChain(
    offline: OfflineAudioContext,
    state: TrackState,
  ): { inNode: GainNode; outNode: GainNode; reverbSend: GainNode; delaySend: GainNode } {
    const fxIn = offline.createGain();
    const eqLow = offline.createBiquadFilter();
    eqLow.type = "lowshelf";
    eqLow.frequency.value = 200;
    eqLow.gain.value = state.fx.eqLowDb;
    const eqMid = offline.createBiquadFilter();
    eqMid.type = "peaking";
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 1;
    eqMid.gain.value = state.fx.eqMidDb;
    const eqHigh = offline.createBiquadFilter();
    eqHigh.type = "highshelf";
    eqHigh.frequency.value = 5000;
    eqHigh.gain.value = state.fx.eqHighDb;
    const compMix = offline.createGain();
    if (state.fx.compEnabled) {
      const comp = offline.createDynamicsCompressor();
      comp.threshold.value = state.fx.compThreshDb;
      comp.ratio.value = state.fx.compRatio;
      comp.knee.value = 6;
      comp.attack.value = 0.005;
      comp.release.value = 0.1;
      eqHigh.connect(comp);
      comp.connect(compMix);
    } else {
      eqHigh.connect(compMix);
    }
    const gainNode = offline.createGain();
    gainNode.gain.value = DB_TO_LINEAR(state.gainDb);
    const panNode = offline.createStereoPanner();
    panNode.pan.value = state.pan;
    const outNode = offline.createGain();
    const reverbSend = offline.createGain();
    reverbSend.gain.value = state.fx.reverbWet;
    const delaySend = offline.createGain();
    delaySend.gain.value = state.fx.delayWet;

    // Wire (mirrors live chain).
    fxIn.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    compMix.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(outNode);
    panNode.connect(reverbSend);
    panNode.connect(delaySend);

    return { inNode: fxIn, outNode, reverbSend, delaySend };
  }

  // ── Project save / load ───────────────────────────────────────────────

  /**
   * Serialize the entire project to a structured object suitable for
   * IndexedDB storage. Audio buffers are converted to compressed WebM/Opus
   * blobs to keep stored project size reasonable (10× smaller than raw
   * WAV, no perceptible quality loss for already-recorded mic takes).
   */
  async serializeProject(): Promise<ProjectFile> {
    if (!this.ctx) throw new Error("Engine not initialized");
    const tracks: ProjectFileTrack[] = [];
    for (const t of this.tracks.values()) {
      let audioBlob: Blob | null = null;
      if (t.blob) {
        // Already have the original record blob — keep it (smaller than re-encoding).
        audioBlob = t.blob;
      } else if (t.buffer) {
        // Beat-rendered or imported buffers don't have a blob — encode WAV
        // for portability. Slightly larger but no decode roundtrip needed.
        const { audioBufferToWav } = await import("./wavEncoder");
        audioBlob = audioBufferToWav(t.buffer);
      }
      tracks.push({
        id: t.state.id,
        name: t.state.name,
        color: t.state.color,
        gainDb: t.state.gainDb,
        pan: t.state.pan,
        muted: t.state.muted,
        solo: t.state.solo,
        armed: t.state.armed,
        fx: { ...t.state.fx },
        durationSec: t.state.durationSec,
        audioBlob,
      });
    }
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      transport: {
        bpm: this.transport.bpm,
        masterDb: this.transport.masterDb,
        masterLimiterOn: this.transport.masterLimiterOn,
        loopEnabled: this.transport.loopEnabled,
        loopStartSec: this.transport.loopStartSec,
        loopEndSec: this.transport.loopEndSec,
      },
      beat: {
        enabled: this.beatMachine.enabled,
        pattern: this.beatMachine.pattern,
      },
      midi: {
        wave: this.midi.wave,
        attackSec: this.midi.attackSec,
        releaseSec: this.midi.releaseSec,
        filterHz: this.midi.filterHz,
      },
      aux: {
        reverbReturn: { ...this.aux.reverbReturn },
        delayReturn: { ...this.aux.delayReturn },
      },
      tracks,
    };
  }

  /**
   * Restore a previously-serialized project. Replaces all tracks with
   * the saved ones (decoding their audio blobs back into AudioBuffers).
   * The engine must be init()'d first.
   */
  async hydrateProject(file: ProjectFile): Promise<void> {
    if (!this.ctx) throw new Error("Engine not initialized");
    this.stop();
    // Clear current tracks. Don't try to merge — load is a full replace.
    for (const t of this.tracks.values()) {
      try {
        t.liveStream?.getTracks().forEach((s) => s.stop());
      } catch {
        /* no-op */
      }
    }
    this.tracks.clear();
    this.waveformCache.clear();
    this.beatTrackId = null;
    this.synthTrackId = null;

    // Restore transport.
    this.transport.bpm = file.transport.bpm;
    this.transport.masterDb = file.transport.masterDb;
    this.transport.masterLimiterOn = file.transport.masterLimiterOn;
    this.transport.loopEnabled = file.transport.loopEnabled;
    this.transport.loopStartSec = file.transport.loopStartSec;
    this.transport.loopEndSec = file.transport.loopEndSec;
    this.transport.positionSec = 0;

    // Restore aux returns.
    this.setAuxReverbDecay(file.aux.reverbReturn.decaySec);
    this.setAuxReverbLevel(file.aux.reverbReturn.level);
    this.setAuxDelayBeats(file.aux.delayReturn.beats);
    this.setAuxDelayFeedback(file.aux.delayReturn.feedback);
    this.setAuxDelayLevel(file.aux.delayReturn.level);

    // Restore beat + midi.
    this.beatMachine.pattern = file.beat.pattern;
    this.beatMachine.enabled = file.beat.enabled;
    this.midi = {
      ...this.midi,
      wave: file.midi.wave,
      attackSec: file.midi.attackSec,
      releaseSec: file.midi.releaseSec,
      filterHz: file.midi.filterHz,
    };

    // Restore tracks.
    for (const t of file.tracks) {
      const id = this.addTrack(t.name, t.color);
      this.setTrackGainDb(id, t.gainDb);
      this.setTrackPan(id, t.pan);
      this.setTrackMute(id, t.muted);
      this.setTrackSolo(id, t.solo);
      this.setTrackArmed(id, t.armed);
      this.setTrackEq(id, "low", t.fx.eqLowDb);
      this.setTrackEq(id, "mid", t.fx.eqMidDb);
      this.setTrackEq(id, "high", t.fx.eqHighDb);
      this.setTrackComp(id, {
        threshDb: t.fx.compThreshDb,
        ratio: t.fx.compRatio,
        enabled: t.fx.compEnabled,
      });
      this.setTrackReverb(id, { wet: t.fx.reverbWet });
      this.setTrackDelay(id, { wet: t.fx.delayWet });

      if (t.audioBlob) {
        try {
          const arr = await t.audioBlob.arrayBuffer();
          const buf = await this.ctx.decodeAudioData(arr);
          this.setTrackBuffer(id, buf);
        } catch (err) {
          console.warn("[DawEngine] hydrate decode failed for track", t.name, err);
        }
      }

      // Restore beat / synth wiring by name.
      if (t.name === "Beat") this.beatTrackId = id;
      if (t.name === "Synth") this.synthTrackId = id;
    }

    this.notify();
  }

  /** Render mix → WAV blob. Suitable for upload to /api/upload. */
  async exportWav(options: RenderMixOptions = { quality: "ultra" }): Promise<Blob> {
    const quality = options.quality ?? "ultra";
    const buf = await this.renderMix({ quality });
    return audioBufferToWav(buf, {
      bitsPerSample: quality === "standard" ? 16 : 24,
      dither: true,
    });
  }

  // ── MIDI / synth ──────────────────────────────────────────────────────

  /** Designate which track the synth voices route into. Like the beat
   *  machine, the synth feeds through a real track strip so its FX rack
   *  applies to anything you play. */
  setSynthTrack(id: TrackId) {
    if (this.tracks.has(id)) this.synthTrackId = id;
  }

  setSynthParam<K extends keyof MidiSynthState>(key: K, value: MidiSynthState[K]) {
    // Only allow editing the safe knobs — activeNotes / midiAvailable /
    // deviceNames are engine-managed.
    if (
      key === "wave" ||
      key === "attackSec" ||
      key === "releaseSec" ||
      key === "filterHz"
    ) {
      this.midi = { ...this.midi, [key]: value };
      this.notify();
    }
  }

  /**
   * Request Web MIDI access and subscribe to every connected input. The
   * on-screen keyboard works regardless — this just adds external
   * controllers as a parallel input source. Returns whether MIDI is now
   * routed (false on denial / unsupported browser, but the engine still
   * functions).
   */
  async enableMidi(): Promise<{ ok: boolean; reason?: string }> {
    if (typeof navigator === "undefined" || !("requestMIDIAccess" in navigator)) {
      return { ok: false, reason: "Web MIDI unsupported in this browser" };
    }
    try {
      const access = await (
        navigator as Navigator & {
          requestMIDIAccess: (opts?: { sysex?: boolean }) => Promise<MIDIAccess>;
        }
      ).requestMIDIAccess({ sysex: false });
      this.midiAccess = access;
      this.attachAllMidiInputs();
      access.onstatechange = () => this.attachAllMidiInputs();
      this.midi = { ...this.midi, midiAvailable: true };
      this.notify();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : "MIDI access denied",
      };
    }
  }

  disableMidi() {
    this.detachAllMidiInputs();
    if (this.midiAccess) {
      try {
        this.midiAccess.onstatechange = null;
      } catch {
        /* no-op */
      }
    }
    this.midiAccess = null;
    this.midi = { ...this.midi, midiAvailable: false, deviceNames: [] };
    this.notify();
  }

  private attachAllMidiInputs() {
    if (!this.midiAccess) return;
    this.detachAllMidiInputs();
    const names: string[] = [];
    this.midiAccess.inputs.forEach((input) => {
      if (input.name) names.push(input.name);
      const handler = (e: Event) => this.handleMidiMessage(e as MIDIMessageEvent);
      input.addEventListener("midimessage", handler);
      this.midiInputHandlers.push({ input, handler });
    });
    this.midi = { ...this.midi, deviceNames: names };
    this.notify();
  }

  private detachAllMidiInputs() {
    for (const { input, handler } of this.midiInputHandlers) {
      try {
        input.removeEventListener("midimessage", handler);
      } catch {
        /* no-op */
      }
    }
    this.midiInputHandlers = [];
  }

  private handleMidiMessage(e: MIDIMessageEvent) {
    if (!e.data) return;
    const status = e.data[0] ?? 0;
    const note = e.data[1] ?? 0;
    const velocity = e.data[2] ?? 0;
    const cmd = status & 0xf0;
    if (cmd === 0x90 && velocity > 0) {
      this.synthNoteOn(note, velocity / 127);
    } else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) {
      this.synthNoteOff(note);
    }
  }

  /** Play a synth note. `note` is a MIDI note number (60 = middle C). */
  synthNoteOn(note: number, velocity: number = 1) {
    if (!this.ctx || !this.synthTrackId) return;
    const target = this.tracks.get(this.synthTrackId);
    if (!target) return;
    // Steal any voice already on this note — re-triggers don't double up.
    this.synthNoteOff(note);

    const ctx = this.ctx;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const osc = ctx.createOscillator();
    osc.type = this.midi.wave;
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = this.midi.filterHz;
    filter.Q.value = 0.7;
    const amp = ctx.createGain();
    amp.gain.value = 0;
    osc.connect(filter).connect(amp).connect(target.fxIn);

    const now = ctx.currentTime;
    const peak = 0.4 * Math.max(0.05, Math.min(1, velocity));
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(peak, now + Math.max(0.001, this.midi.attackSec));
    osc.start(now);

    this.activeVoices.set(note, { osc, amp, filter });
    if (!this.midi.activeNotes.includes(note)) {
      this.midi = { ...this.midi, activeNotes: [...this.midi.activeNotes, note] };
      this.notify();
    }
    // Capture into the in-flight MIDI recording, if any. Time is stored
    // in beats (not seconds) so the clip stays musical when BPM changes.
    if (this.midi.recordingClip) {
      const elapsedSec = ctx.currentTime - this.midiRecordStartTime;
      const beat = (elapsedSec / 60) * this.transport.bpm;
      this.midiRecordEvents.push({ note, downBeat: beat, upBeat: null, velocity });
    }
  }

  synthNoteOff(note: number) {
    if (!this.ctx) return;
    const voice = this.activeVoices.get(note);
    if (!voice) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const release = Math.max(0.01, this.midi.releaseSec);
    voice.amp.gain.cancelScheduledValues(now);
    // Linear release — exponentialRamp can't go to zero.
    voice.amp.gain.setValueAtTime(voice.amp.gain.value, now);
    voice.amp.gain.linearRampToValueAtTime(0, now + release);
    try {
      voice.osc.stop(now + release + 0.05);
    } catch {
      /* may already be stopped */
    }
    this.activeVoices.delete(note);

    const next = this.midi.activeNotes.filter((n) => n !== note);
    if (next.length !== this.midi.activeNotes.length) {
      this.midi = { ...this.midi, activeNotes: next };
      this.notify();
    }
    // Stamp the matching down event in the recording buffer.
    if (this.midi.recordingClip) {
      const elapsedSec = ctx.currentTime - this.midiRecordStartTime;
      const beat = (elapsedSec / 60) * this.transport.bpm;
      // Walk backwards — match the most recent unfinished down event.
      for (let i = this.midiRecordEvents.length - 1; i >= 0; i--) {
        const ev = this.midiRecordEvents[i];
        if (ev && ev.note === note && ev.upBeat === null) {
          ev.upBeat = beat;
          break;
        }
      }
    }
  }

  // ── MIDI clip recording / playback ────────────────────────────────────

  /** Begin capturing live synth input into a clip. Subsequent synthNoteOn /
   *  synthNoteOff calls (from MIDI hardware OR the on-screen keyboard)
   *  are timestamped relative to record start. Stop with stopMidiClipRec
   *  to commit the captured notes as the synth track's clip. */
  startMidiClipRec() {
    if (!this.ctx) return;
    this.midiRecordEvents = [];
    this.midiRecordStartTime = this.ctx.currentTime;
    this.midi = { ...this.midi, recordingClip: true };
    this.notify();
  }

  /** Finish capturing and commit the recorded notes as a MidiClip. Open
   *  notes (no upBeat) are auto-closed at the recording end. */
  stopMidiClipRec(): MidiClip | null {
    if (!this.ctx || !this.midi.recordingClip) return null;
    const endBeat = ((this.ctx.currentTime - this.midiRecordStartTime) / 60) * this.transport.bpm;
    const notes: MidiNote[] = [];
    for (const ev of this.midiRecordEvents) {
      const upBeat = ev.upBeat ?? endBeat;
      const duration = Math.max(0.05, upBeat - ev.downBeat);
      notes.push({
        note: ev.note,
        startBeat: ev.downBeat,
        durationBeats: duration,
        velocity: ev.velocity,
      });
    }
    notes.sort((a, b) => a.startBeat - b.startBeat);
    // Round clip length up to the nearest bar so loop playback feels musical.
    const rawLen = endBeat;
    const lengthBeats = Math.max(4, Math.ceil(rawLen / 4) * 4);
    const clip: MidiClip = { notes, lengthBeats };
    this.midi = { ...this.midi, recordingClip: false, clip };
    this.midiRecordEvents = [];
    this.notify();
    // If transport is still rolling, kick the clip scheduler so playback
    // takes effect immediately on the next loop.
    if (this.transport.isPlaying) this.scheduleMidiClipTicks();
    return clip;
  }

  clearMidiClip() {
    this.midi = { ...this.midi, clip: null };
    this.notify();
  }

  /** Look-ahead clip scheduler. Walks beat-time forward and fires every
   *  note whose start falls in the upcoming window. Loops the clip end. */
  private scheduleMidiClipTicks() {
    if (!this.ctx) return;
    const clip = this.midi.clip;
    if (!clip) return;
    const ctx = this.ctx;
    const beatSec = () => 60 / this.transport.bpm;

    this.midiClipNextTime = ctx.currentTime + 0.05;
    this.midiClipNextBeat = 0;

    const fire = () => {
      if (!this.transport.isPlaying || !this.midi.clip) {
        this.midiClipTimerId = null;
        return;
      }
      const horizon = ctx.currentTime + 0.2;
      while (this.midiClipNextTime < horizon) {
        const localBeat = this.midiClipNextBeat % clip.lengthBeats;
        // Schedule notes whose start falls in [localBeat, localBeat+1bin)
        // where bin is a fraction of a beat. We poll one full beat per
        // outer iteration and rely on look-ahead to schedule sub-beat
        // notes precisely via setValueAtTime.
        const binEnd = localBeat + 1; // 1-beat scheduling window
        for (const n of clip.notes) {
          if (n.startBeat >= localBeat && n.startBeat < binEnd) {
            const offsetBeats = n.startBeat - localBeat;
            const noteStart = this.midiClipNextTime + offsetBeats * beatSec();
            this.scheduleScheduledMidiNote(n, noteStart);
          }
        }
        this.midiClipNextTime += beatSec();
        this.midiClipNextBeat++;
      }
      this.midiClipTimerId = window.setTimeout(fire, 25);
    };
    fire();
  }

  /** Schedule a single MIDI note to play at a specific ctx-time. Builds
   *  a one-shot voice — we don't reuse the held-note voice map because
   *  scheduled notes don't have a corresponding noteOff source. */
  private scheduleScheduledMidiNote(n: MidiNote, when: number) {
    if (!this.ctx || !this.synthTrackId) return;
    const target = this.tracks.get(this.synthTrackId);
    if (!target) return;
    const ctx = this.ctx;
    const beatSec = 60 / this.transport.bpm;
    const durSec = n.durationBeats * beatSec;
    const freq = 440 * Math.pow(2, (n.note - 69) / 12);
    const osc = ctx.createOscillator();
    osc.type = this.midi.wave;
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = this.midi.filterHz;
    filter.Q.value = 0.7;
    const amp = ctx.createGain();
    osc.connect(filter).connect(amp).connect(target.fxIn);
    const peak = 0.4 * Math.max(0.05, Math.min(1, n.velocity));
    const attack = Math.max(0.001, this.midi.attackSec);
    const release = Math.max(0.01, this.midi.releaseSec);
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(peak, when + attack);
    amp.gain.setValueAtTime(peak, when + Math.max(attack, durSec));
    amp.gain.linearRampToValueAtTime(0, when + Math.max(attack, durSec) + release);
    osc.start(when);
    osc.stop(when + Math.max(attack, durSec) + release + 0.05);
  }

  private stopMidiClipScheduler() {
    if (this.midiClipTimerId !== null) {
      clearTimeout(this.midiClipTimerId);
      this.midiClipTimerId = null;
    }
  }

  /** Panic: silence every voice instantly. */
  synthAllNotesOff() {
    for (const note of Array.from(this.activeVoices.keys())) {
      this.synthNoteOff(note);
    }
  }

  /** Snapshot current state for React. Cheap; UI re-reads this on each
   *  notify(). Returns plain objects, not internal handles. */
  getSnapshot(): EngineSnapshot {
    return {
      transport: { ...this.transport },
      tracks: Array.from(this.tracks.values()).map((t) => ({
        ...t.state,
        fx: { ...t.state.fx },
      })),
      beat: {
        enabled: this.beatMachine.enabled,
        activeStep: this.beatMachine.activeStep,
        pattern: clonePattern(this.beatMachine.pattern),
        activeBank: this.beatMachine.activeBank,
        bankPatterns: {
          A: clonePattern(this.beatMachine.bankPatterns.A),
          B: clonePattern(this.beatMachine.bankPatterns.B),
          C: clonePattern(this.beatMachine.bankPatterns.C),
          D: clonePattern(this.beatMachine.bankPatterns.D),
        },
        kit: this.beatMachine.kit,
      },
      midi: {
        ...this.midi,
        activeNotes: [...this.midi.activeNotes],
        clip: this.midi.clip
          ? {
              lengthBeats: this.midi.clip.lengthBeats,
              notes: this.midi.clip.notes.map((n) => ({ ...n })),
            }
          : null,
      },
      aux: {
        reverbReturn: { ...this.aux.reverbReturn },
        delayReturn: { ...this.aux.delayReturn },
      },
    };
  }

  destroy() {
    this.stop();
    this.stopMetronome();
    this.stopBeatScheduler();
    this.synthAllNotesOff();
    this.detachAllMidiInputs();
    if (this.midiAccess) {
      try {
        this.midiAccess.onstatechange = null;
      } catch {
        /* no-op */
      }
      this.midiAccess = null;
    }
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    for (const t of this.tracks.values()) {
      t.liveStream?.getTracks().forEach((s) => s.stop());
    }
    this.tracks.clear();
    if (this.ctx && this.ctx.state !== "closed") {
      void this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.listeners.clear();
  }
}
