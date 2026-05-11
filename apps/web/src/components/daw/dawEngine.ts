/**
 * EMS DAW audio engine. Pure Web Audio + DOM, no React.
 *
 * Architecture (signal flow per track):
 *
 *   [BufferSource | LiveMicSource]  →  EQ/Comp  →  VocalBus  →  Gain  →  Pan  →  ┐
 *                                                                         sends →  ├→  Shared Reverb/Delay Returns
 *   [BufferSource | LiveMicSource]  →  EQ/Comp  →  VocalBus  →  Gain  →  Pan  →  ┘
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
  type BeatLaneEqSetting,
  type BeatPattern,
  type BeatStepOptionsMap,
  type BeatStepOptions,
  type BeatFillPreset,
  type DrumKind,
  DRUM_LANES,
  STEPS,
  STEPS_PER_BEAT,
  emptyPattern,
  fillPattern,
  scheduleDrumHit,
  type DrumKitId,
} from "./beatMachine";
import type { ChordHit } from "./chordDetect";
import { audioBufferToWav } from "./wavEncoder";

export type TrackId = string;

/** Three-band EQ identifier — single source of truth used by engine,
 *  AI tool schemas, and UI props. Matches the engine's internal biquad
 *  layout (low shelf @ 200 Hz, mid bell @ 1 kHz, high shelf @ 5 kHz).
 *  All EQ-touching code paths import this type rather than re-declaring
 *  the literal union, so changes here propagate everywhere (#20). */
export type EqBand = "low" | "mid" | "high";

export interface TrackFx {
  /** EQ — three biquads acting as low shelf / mid bell / high shelf. */
  eqLowDb: number; // -12..+12 @ 200 Hz
  eqMidDb: number; // -12..+12 @ 1000 Hz, Q=1
  eqHighDb: number; // -12..+12 @ 5000 Hz
  /** Compressor — DynamicsCompressor parameters. */
  compEnabled: boolean;
  compThreshDb: number; // -60..0
  compRatio: number; // 1..20
  /** New York / parallel compression blend (#11). 0 = serial (full
   *  compression, current behavior), 1 = fully parallel (dry + smashed
   *  in equal blend). When 0 we behave exactly like before for
   *  backwards compat; >0 mixes the unprocessed dry signal back in. */
  compParallelBlend: number; // 0..1
  /** EMS vocal bus — console-style drive/tone/parallel crush + de-esser. */
  vocalBusEnabled: boolean;
  vocalBusDriveDb: number; // 0..18
  vocalBusPresenceDb: number; // -6..+6 @ 3.2 kHz
  vocalBusAirDb: number; // -6..+8 @ 10.5 kHz
  vocalBusCrush: number; // 0..1 parallel compression blend
  /** De-esser cut depth in dB (0..-12). A frequency-selective notch at
   *  ~6.5 kHz tames sibilance + harsh consonants on vocal takes. 0 =
   *  bypassed; negative values dip the band. Pairs with the existing
   *  presence + air shelves to finish a vocal chain in one strip. */
  vocalBusDeEssDb: number; // -12..0 (always cut, never boost)
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
  /** Input trim on the mic before it hits the FX chain or monitor.
   *  Default: -6 dB (=0.5 linear). Most consumer mics ship hot; running
   *  at unity slams the input on a normal voice and clips the FX chain.
   *  Range -24..+12 dB. Adjustable per track via setTrackInputGain. */
  inputGainDb: number;
  hasAudio: boolean; // true once a buffer or blob is attached
  durationSec: number;
  level: number; // 0..1 instantaneous output level (UI-driven)
  /** Per-track EQ analyzer bins (0..1), sampled from this strip's EQ stage. */
  eqSpectrum: number[];
  fx: TrackFx;
  /** When set, this track's level ducks based on the source track's
   *  amplitude — modern sidechain pumping. null disables. */
  sidechainFromId: TrackId | null;
  /** Sidechain depth: 0 = no ducking, 1 = full duck on peaks. */
  sidechainAmount: number;
  /** Input calibration: true while sampling armed input for gain staging. */
  inputCalibrating: boolean;
  /** Peak input amplitude observed during the latest calibration window. */
  inputObservedPeak: number;
  /** Suggested trim in dB after calibration. Null when no suggestion yet. */
  suggestedInputGainDb: number | null;
  /** Current compressor gain reduction in dB (negative when reducing). */
  compGainReductionDb: number;
  /** Optional VCA group this track follows. */
  vcaGroupId: string | null;
  /** Simple automation lanes for foundational mixing moves. */
  automation: {
    gainDb: Array<{ timeSec: number; valueDb: number }>;
    pan: Array<{ timeSec: number; value: number }>;
  };
  /** Loop recording take lanes for comping. */
  compLanes: Array<{
    id: string;
    name: string;
    durationSec: number;
    createdAt: string;
    selected: boolean;
  }>;
  /** Phrase comp map: 8 segments, each pointing to a lane id. */
  compSegmentLaneIds: string[];
  /** Track freezing: when true, the audio buffer attached to this track
   *  is the pre-rendered output of its FX chain (EQ + comp + vocal bus +
   *  reverb send + delay send + gain + pan), so the live playback chain
   *  is bypassed and CPU drops dramatically. The user can unfreeze any
   *  time to keep editing. The original buffer + FX values are stashed
   *  in TrackInternal during freeze so unfreeze fully restores them. */
  frozen: boolean;
}

interface TrackInternal {
  state: TrackState;
  // Signal flow: fxIn → sidechainDuck → EQ → comp/bypass → vocal bus → gain → pan → meter → master
  //                                                                            ├→ reverbSend → shared reverb return
  //                                                                            └→ delaySend → shared delay return
  fxIn: GainNode;
  /** Gain node that's modulated by the sidechain source's amplitude
   *  during tick(). Default 1.0 (no ducking). */
  sidechainDuck: GainNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  eqAnalyser: AnalyserNode;
  eqSpectrumBuf: Uint8Array;
  comp: DynamicsCompressorNode;
  compBypass: GainNode;
  compMix: GainNode;
  vocalBusDrive: GainNode;
  vocalBusSaturator: WaveShaperNode;
  vocalBusPresence: BiquadFilterNode;
  vocalBusAir: BiquadFilterNode;
  /** De-esser — peaking notch at ~6.5 kHz that dips the sibilance band
   *  when vocalBusDeEssDb is negative. Bypassed (gain 0) by default. */
  vocalBusDeEss: BiquadFilterNode;
  vocalBusDryGain: GainNode;
  vocalBusCrush: DynamicsCompressorNode;
  vocalBusCrushGain: GainNode;
  vocalBusSum: GainNode;
  reverbSendGain: GainNode;
  delaySendGain: GainNode;
  gainNode: GainNode;
  panNode: StereoPannerNode;
  /** Post-pan monitor gate (used for AFL monitoring mode). */
  monitorOutGain: GainNode;
  meterAnalyser: AnalyserNode;
  meterBuf: Uint8Array;
  /** Current audio buffer for playback/export. */
  buffer: AudioBuffer | null;
  /** Saved copy of the last take, used for undo-delete. */
  previousBuffer: AudioBuffer | null;
  blob: Blob | null;
  source: AudioBufferSourceNode | null;
  liveSource: MediaStreamAudioSourceNode | null;
  liveStream: MediaStream | null;
  /** Input trim. Sits right after the mic source and before the
   *  monitor split + FX chain. Mirrors state.inputGainDb. Persistent
   *  across record sessions so user-set trim survives stop/start. */
  inputGain: GainNode | null;
  /** Gain node sitting between liveSource and fxIn. Defaults to 0 so the
   *  performer's voice does NOT route to speakers by default — that's
   *  what causes feedback when monitoring without headphones. UI flips
   *  this to 1 only after explicit confirm. */
  monitorGain: GainNode | null;
  /** Optional monitor latency delay. Driven by transport.latencyMode. */
  monitorLatencyDelay: DelayNode | null;
  /** Optional monitor tone filter for high-quality monitoring mode. */
  monitorToneFilter: BiquadFilterNode | null;
  recorder: MediaRecorder | null;
  recordedChunks: Blob[];
  /** PCM ring buffer used for pre-roll. */
  preRollChunks: Float32Array[];
  preRollFrames: number;
  /** PCM captured for the currently active take. */
  activeTakeChunks: Float32Array[];
  /** True while a take is actively capturing audio frames. */
  captureActive: boolean;
  /** Audio tap node for pre-roll + auto-gain sampling. */
  inputTap: ScriptProcessorNode | null;
  inputTapSink: GainNode | null;
  /** Timestamp for armed-input auto-calibration start. */
  inputCalibrationStartedAtMs: number | null;
  inputCalibrationPeak: number;
  /** Optional WebCodecs encoder state for Opus capture path. */
  webCodecEncoder: {
    flush: () => Promise<void>;
    close: () => void;
    encode: (data: unknown) => void;
    state?: string;
  } | null;
  webCodecChunks: Array<{
    type: "key" | "delta";
    timestamp: number;
    duration: number;
    data: Uint8Array;
  }>;
  webCodecInputFrames: number;
  webCodecSampleRate: number;
  captureBackend: "mediarecorder" | "webcodecs-opus";
  /** Comp lane buffers for loop recording. */
  compLaneBuffers: Array<{ id: string; name: string; buffer: AudioBuffer; createdAt: string }>;
  compSegmentLaneIds: string[];
  /** Track freezing — set when we render-and-bypass. Null when unfrozen. */
  preFreezeBuffer: AudioBuffer | null;
  preFreezeFx: TrackFx | null;
  preFreezeGainDb: number | null;
  preFreezePan: number | null;
}

export interface TransportState {
  isPlaying: boolean;
  isRecording: boolean;
  bpm: number;
  positionSec: number;
  metronomeOn: boolean;
  latencyMode: "recording" | "mixing";
  inputMonitorMode: "low-latency" | "high-quality";
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
  /** Tape saturation drive on the master bus (0..1). 0 = bypassed, 1 =
   *  aggressive analog console color. Sits before the limiter so the
   *  user can hit the limiter with a saturated signal. Subtly compresses
   *  transients and adds even harmonics that fatten without obvious
   *  distortion until ~0.5+. */
  masterTapeDrive: number;
  /** Gain reduction from the master limiter, in dB. 0 means no clamping;
   *  -3 means the limiter is pulling 3 dB out of the signal. Sourced from
   *  DynamicsCompressorNode.reduction each frame. UI inverts this into a
   *  downward-growing red bar so producers can see the limiter working. */
  masterLimiterReduction: number;
  /** Stereo phase correlation meter, -1 (out of phase) .. +1 (in phase). */
  masterPhaseCorrelation: number;
  /** Solo behavior mode: SIP mutes others, AFL monitors selected tracks only. */
  soloMode: "sip" | "afl";
  /** Dedicated AFL audition bus meter level (0..1). */
  aflBusLevel: number;
  /** True when monitor output is collapsed to mono for translation checks. */
  monoPreviewOn: boolean;
  /** VCA group controls for linked multi-track fader moves. */
  vcaGroups: Array<{ id: string; name: string; gainDb: number }>;
  /** Reference-track A/B state at matched loudness. */
  referenceEnabled: boolean;
  referenceMatchDb: number;
  /** Punch-in / punch-out recording mode. When enabled, recording only
   *  captures between punchInSec and punchOutSec, leaving the rest of
   *  the existing take intact. */
  punchInEnabled: boolean;
  punchInSec: number;
  punchOutSec: number;
  /** Count-in before recording starts when transport is idle. */
  countInEnabled: boolean;
  countInBars: 1 | 2;
  countInRemainingBeats: number;
  /** Pre-roll audio retained from armed input before Record is pressed. */
  preRollSec: number;
  /** Loop recording generates take lanes while looping the same section. */
  loopRecordEnabled: boolean;
  maxLoopTakes: number;
  /** Recording backend currently used for capture. */
  captureBackend: "mediarecorder" | "webcodecs-opus";
  /** ID of the track captured in the most recent recording pass.
   *  Cleared when the user dismisses the post-record action banner or
   *  starts a new recording. */
  lastRecordedTrackId: string | null;
}

// Re-export the canonical DrumKitId so consumers don't need to reach
// into beatMachine for it. Keep beatMachine.ts as the single source of
// truth for the actual kit list.
export type { DrumKitId, BeatStepOptions, BeatFillPreset } from "./beatMachine";
export type PatternBank = "A" | "B" | "C" | "D";

export interface LaneFrequencyProfile {
  source: "synth" | "sample";
  dominantHz: number;
  lowBandRatio: number;
  risk: "low" | "medium" | "high";
  guidance: string;
}

export interface LaneEqRecommendation {
  lane: DrumKind;
  type: "hp" | "lp" | "retune";
  valueHz: number;
  confidence: number;
  reason: string;
}

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
  /** Optional secondary kit per lane. When set, the lane's hit is also
   *  fired through this kit's synth, layered on top of the primary kit
   *  (e.g., trap 808 + acoustic kick). null on a lane = no layering. */
  layerKitB: Partial<Record<DrumKind, DrumKitId>>;
  /** Optional file name per lane when a custom one-shot sample is assigned. */
  laneSampleNames: Record<DrumKind, string | null>;
  /** Per-lane pitch in semitones (-12..+12). Applied to both the synth
   *  kit and the loaded sample at scheduling time. Tuning 808 kicks to
   *  the song key is the single most-requested move that wasn't here. */
  laneSemis: Partial<Record<DrumKind, number>>;
  /** Per-lane "play sample reversed" toggle. When true, the lane plays
   *  its primary sample (or current round-robin variant) backwards.
   *  Synth-only lanes ignore this — there's no buffer to reverse. */
  laneReversed: Partial<Record<DrumKind, boolean>>;
  /** Per-lane custom display name override. Falls back to the canonical
   *  LANE_LABELS in the UI when unset. Producers loading a percussion-
   *  only kit can rename "kick → shaker" without losing the lane's
   *  underlying DrumKind routing. */
  laneNames: Partial<Record<DrumKind, string>>;
  /** Per-lane resonator amount (0..1). When >0, each hit also fires a
   *  short pitched sine tail tuned to the lane's center frequency.
   *  Producers use this to add tonal richness to flat-sounding drum
   *  one-shots — kicks become more "musical," snares get a slight body
   *  ring. 0 = bypass (default). */
  laneResonator: Partial<Record<DrumKind, number>>;
  /** Round-robin variant file names per lane. The primary sample stays
   *  in laneSampleNames; up to 3 additional samples are listed here and
   *  the scheduler cycles through them on consecutive hits for realism. */
  laneVariantNames: Record<DrumKind, string[]>;
  /** Lane-level EQ templates applied before each hit reaches the beat track. */
  laneEqSettings: Record<DrumKind, BeatLaneEqSetting>;
  /** Low-end occupancy profile per lane for arrangement and mix guidance. */
  laneFrequencyProfiles: Record<DrumKind, LaneFrequencyProfile>;
  /** Per-step modifiers (velocity, probability, micro-shift, repeats).
   *  Sparse — missing entries fall back to the defaults. Saved as part
   *  of the project so velocity/probability/etc round-trip. */
  stepOptions: BeatStepOptionsMap;
  /** Same shape as stepOptions but per-bank, so bank switching keeps the
   *  modifiers attached to the right pattern. */
  bankStepOptions: Record<PatternBank, BeatStepOptionsMap>;
  /** Global swing 0..0.66. Shifts every 2nd 16th forward by
   *  swing * stepDur * 0.5 — at 0.5 you get exact 8th-note triplets. */
  swing: number;
  /** Humanize jitter in ms (0..15). Each step gets a random ±humanizeMs
   *  shift before scheduling. 0 = robotic, 5–8 = recorded feel. */
  humanizeMs: number;
  /** Live performance stutter. 0 = off, 1..4 = subdivide the next bar at
   *  1/4, 1/8, 1/16, 1/32 notes by repeatedly firing step 0's hits. */
  stutter: number;
  /** When true, the scheduler auto-injects a fill on the last bar
   *  before a queued bank change so the switch isn't abrupt. */
  fillsEnabled: boolean;
  /** Queued next bank — set by setQueuedBank to defer the switch until
   *  the loop boundary. null = no queued change. */
  queuedBank: PatternBank | null;
  /** Fill preset used when fillsEnabled is true and queuedBank is set. */
  fillPreset: BeatFillPreset;
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
  /** Portamento / glide time in seconds (0..1). When >0, a new note
   *  pitch-ramps from the previous note's pitch instead of snapping.
   *  0 = legato off (default). Producers use this for 808 melody slides
   *  and vocal-style lead synths. */
  glideSec: number;
  /** MPE-style velocity-to-filter modulation. 0 = filter is fixed at
   *  `filterHz`; positive values open the filter further when velocity
   *  is high (softer notes stay darker). Range 0..6000 Hz. */
  filterVelocityModHz: number;
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
  /** Optional export guard ceiling in dBTP. null/undefined disables trim. */
  truePeakCeilingDbtp?: number | null;
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
  vcaGroupId?: string | null;
  automation?: {
    gainDb: Array<{ timeSec: number; valueDb: number }>;
    pan: Array<{ timeSec: number; value: number }>;
  };
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
    inputMonitorMode?: "low-latency" | "high-quality";
    countInEnabled?: boolean;
    countInBars?: 1 | 2;
    preRollSec?: number;
    loopRecordEnabled?: boolean;
    maxLoopTakes?: number;
    soloMode?: "sip" | "afl";
    vcaGroups?: Array<{ id: string; name: string; gainDb: number }>;
    referenceMatchDb?: number;
  };
  beat: {
    enabled: boolean;
    pattern: BeatPattern;
    kit: DrumKitId;
    laneSamples: Record<DrumKind, { name: string; audioBlob: Blob } | null>;
    laneEqSettings?: Record<DrumKind, BeatLaneEqSetting>;
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
const COMP_SEGMENT_COUNT = 8;

export type MasteringPresetId =
  | "streamReady"
  | "loudClub"
  | "podcast"
  | "balancedAcoustic"
  | "flat";

export interface MasteringPresetConfig {
  /** Display label shown in the preset selector. */
  label: string;
  /** One-line description for the user. */
  description: string;
  /** Master EQ low shelf gain at 200 Hz (-12..+12). */
  eqLowDb: number;
  /** Master EQ mid peaking gain at 1 kHz (-12..+12). */
  eqMidDb: number;
  /** Master EQ high shelf gain at 5 kHz (-12..+12). */
  eqHighDb: number;
  /** Whether the master limiter is engaged. */
  limiterOn: boolean;
  /** Master output gain in dB. Slight pre-limiter push lets loud
   *  presets hit the limiter harder for that "radio" sheen, while
   *  podcast/flat keep more headroom. */
  masterDb: number;
}

/** Five blessed mastering chains. Tuned by ear against 2024-2025 reference
 *  releases on streaming platforms; values are conservative starting points
 *  rather than maximum-loudness commitments — users can push harder
 *  manually after applying a preset. */
const MASTERING_PRESETS: Record<MasteringPresetId, MasteringPresetConfig> = {
  streamReady: {
    label: "Stream-Ready",
    description: "-14 LUFS target. Balanced, translates well on phone speakers and headphones.",
    eqLowDb: 1.5,
    eqMidDb: -1.5,
    eqHighDb: 2.0,
    limiterOn: true,
    masterDb: -1,
  },
  loudClub: {
    label: "Loud Club",
    description: "Max impact for sound systems. Pushes the limiter hard — use on already-mixed tracks.",
    eqLowDb: 3.0,
    eqMidDb: -2.5,
    eqHighDb: 2.5,
    limiterOn: true,
    masterDb: 2,
  },
  podcast: {
    label: "Podcast / Voice",
    description: "Speech-clarity curve. Cuts low rumble, lifts presence, gentle limiting only.",
    eqLowDb: -3.0,
    eqMidDb: 1.5,
    eqHighDb: 1.0,
    limiterOn: true,
    masterDb: -2,
  },
  balancedAcoustic: {
    label: "Acoustic / Live",
    description: "Natural feel for acoustic, live, or jazz. No limiter, plenty of dynamics.",
    eqLowDb: 0.5,
    eqMidDb: 0.5,
    eqHighDb: 1.5,
    limiterOn: false,
    masterDb: -3,
  },
  flat: {
    label: "Flat (No Master Processing)",
    description: "Bypass — every band at 0 dB, limiter off. Use when you want to A/B against a preset.",
    eqLowDb: 0,
    eqMidDb: 0,
    eqHighDb: 0,
    limiterOn: false,
    masterDb: 0,
  },
};

export const MASTERING_PRESET_ORDER: MasteringPresetId[] = [
  "streamReady",
  "loudClub",
  "podcast",
  "balancedAcoustic",
  "flat",
];

export function getMasteringPreset(id: MasteringPresetId): MasteringPresetConfig {
  return MASTERING_PRESETS[id];
}

const DEFAULT_TRACK_FX: TrackFx = {
  eqLowDb: 0,
  eqMidDb: 0,
  eqHighDb: 0,
  compEnabled: true,
  compThreshDb: -18,
  compRatio: 3,
  compParallelBlend: 0,
  vocalBusEnabled: false,
  vocalBusDriveDb: 0,
  vocalBusPresenceDb: 0,
  vocalBusAirDb: 0,
  vocalBusCrush: 0,
  vocalBusDeEssDb: 0,
  reverbWet: 0,
  reverbDecaySec: 2.5,
  delayWet: 0,
  delayBeats: 0.5,
  delayFeedback: 0.35,
};

function completeTrackFx(fx?: Partial<TrackFx> | null): TrackFx {
  return { ...DEFAULT_TRACK_FX, ...(fx ?? {}) };
}

function buildConsoleSaturationCurve(amount: number): Float32Array<ArrayBuffer> {
  const clamped = Math.max(0, Math.min(1, amount));
  const samples = 2048;
  const curve = new Float32Array(
    new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT),
  );
  if (clamped <= 0) {
    for (let i = 0; i < samples; i++) {
      curve[i] = (i / (samples - 1)) * 2 - 1;
    }
    return curve;
  }

  const drive = 1 + clamped * 7;
  const normalizer = Math.tanh(drive);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / normalizer;
  }
  return curve;
}

function clonePattern(p: BeatPattern): BeatPattern {
  // Use emptyPattern() as the base so the type system sees all 8 lanes
  // initialized — passing `{} as BeatPattern` to reduce() leaves the
  // accumulator structurally narrow and TS rejects the result.
  const out = emptyPattern();
  for (const lane of DRUM_LANES) out[lane] = [...p[lane]];
  return out;
}

function cloneStepOptions(map: BeatStepOptionsMap): BeatStepOptionsMap {
  const out: BeatStepOptionsMap = {};
  for (const laneRaw of Object.keys(map)) {
    const lane = laneRaw as DrumKind;
    const lanemap = map[lane];
    if (!lanemap) continue;
    const copy: Record<number, BeatStepOptions> = {};
    for (const k of Object.keys(lanemap)) {
      const stepNum = Number(k);
      const v = lanemap[stepNum];
      if (v) copy[stepNum] = { ...v };
    }
    out[lane] = copy;
  }
  return out;
}

function emptyBeatLaneSampleNames(): Record<DrumKind, string | null> {
  return DRUM_LANES.reduce((acc, lane) => {
    acc[lane] = null;
    return acc;
  }, {} as Record<DrumKind, string | null>);
}

function emptyBeatLaneEqSettings(): Record<DrumKind, BeatLaneEqSetting> {
  return DRUM_LANES.reduce((acc, lane) => {
    acc[lane] = { hpHz: null, lpHz: null };
    return acc;
  }, {} as Record<DrumKind, BeatLaneEqSetting>);
}

const SYNTH_LANE_CENTERS_HZ: Record<DrumKind, number> = {
  kick: 62,
  snare: 190,
  clap: 520,
  hat: 9000,
  openHat: 7800,
  perc: 850,
  bass808: 52,
  crash: 6200,
};

const SYNTH_LANE_LOW_RATIO: Record<DrumKind, number> = {
  kick: 0.78,
  snare: 0.2,
  clap: 0.08,
  hat: 0.01,
  openHat: 0.02,
  perc: 0.12,
  bass808: 0.94,
  crash: 0.03,
};

function describeLaneRisk(lane: DrumKind, dominantHz: number, lowBandRatio: number): {
  risk: "low" | "medium" | "high";
  guidance: string;
} {
  if ((lane === "hat" || lane === "openHat" || lane === "crash") && lowBandRatio > 0.2) {
    return {
      risk: "high",
      guidance: "High-frequency lane carries too much low-end. High-pass this sample harder.",
    };
  }
  if (lane === "bass808") {
    if (dominantHz > 120) {
      return {
        risk: "high",
        guidance: "808 dominant energy is too high in frequency. Retune or low-pass toward sub range.",
      };
    }
    if (lowBandRatio < 0.55) {
      return {
        risk: "medium",
        guidance: "808 low-band occupancy is light. Add sub weight or reduce top harmonics.",
      };
    }
    return { risk: "low", guidance: "808 low-end occupancy looks solid." };
  }
  if (lane === "kick") {
    if (dominantHz < 38 || dominantHz > 115) {
      return {
        risk: "medium",
        guidance: "Kick tonal center is outside a typical punch range. Tune for 45-95 Hz body.",
      };
    }
    return { risk: "low", guidance: "Kick occupancy sits in a practical punch zone." };
  }
  if (lowBandRatio > 0.5) {
    return {
      risk: "medium",
      guidance: "This lane contributes heavy low-end. Check overlap with kick/808.",
    };
  }
  return { risk: "low", guidance: "Lane occupancy is balanced for its role." };
}

function buildLaneProfile(
  lane: DrumKind,
  source: "synth" | "sample",
  dominantHz: number,
  lowBandRatio: number,
): LaneFrequencyProfile {
  const safeDominant = Number.isFinite(dominantHz) ? Math.max(20, Math.min(12000, dominantHz)) : 0;
  const safeRatio = Number.isFinite(lowBandRatio) ? Math.max(0, Math.min(1, lowBandRatio)) : 0;
  const assessed = describeLaneRisk(lane, safeDominant, safeRatio);
  return {
    source,
    dominantHz: safeDominant,
    lowBandRatio: safeRatio,
    risk: assessed.risk,
    guidance: assessed.guidance,
  };
}

function emptyBeatLaneFrequencyProfiles(): Record<DrumKind, LaneFrequencyProfile> {
  return DRUM_LANES.reduce((acc, lane) => {
    acc[lane] = buildLaneProfile(
      lane,
      "synth",
      SYNTH_LANE_CENTERS_HZ[lane],
      SYNTH_LANE_LOW_RATIO[lane],
    );
    return acc;
  }, {} as Record<DrumKind, LaneFrequencyProfile>);
}

function findSampleTrimRange(buffer: AudioBuffer, threshold: number): { start: number; end: number } {
  const frames = buffer.length;
  let start = 0;
  let end = Math.max(0, frames - 1);
  let foundStart = false;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      if (Math.abs(buffer.getChannelData(ch)[i] ?? 0) >= threshold) {
        start = i;
        foundStart = true;
        break;
      }
    }
    if (foundStart) break;
  }
  let foundEnd = false;
  for (let i = frames - 1; i >= 0; i--) {
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      if (Math.abs(buffer.getChannelData(ch)[i] ?? 0) >= threshold) {
        end = i;
        foundEnd = true;
        break;
      }
    }
    if (foundEnd) break;
  }
  if (!foundStart || !foundEnd || end <= start) {
    return { start: 0, end: frames - 1 };
  }
  return { start, end };
}

export class DawEngine {
  /** Read-only handle to the audio context for diagnostics panels.
   *  Set after init() succeeds; null before the first user gesture. */
  audioContext: AudioContext | null = null;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private masterEqLow: BiquadFilterNode | null = null;
  private masterEqMid: BiquadFilterNode | null = null;
  private masterEqHigh: BiquadFilterNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private masterTape: WaveShaperNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private aflBusAnalyser: AnalyserNode | null = null;
  private aflBusBuf: Uint8Array | null = null;
  private monitorOutGain: GainNode | null = null;
  private referenceGain: GainNode | null = null;
  private referenceBuffer: AudioBuffer | null = null;
  private referenceSource: AudioBufferSourceNode | null = null;
  private monoOutGain: GainNode | null = null;
  private monoSplitter: ChannelSplitterNode | null = null;
  private monoMerger: ChannelMergerNode | null = null;
  private monoSumGain: GainNode | null = null;
  private phaseLeftAnalyser: AnalyserNode | null = null;
  private phaseRightAnalyser: AnalyserNode | null = null;
  private phaseLeftBuf: Float32Array | null = null;
  private phaseRightBuf: Float32Array | null = null;
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
    layerKitB: {},
    laneSemis: {},
    laneReversed: {},
    laneNames: {},
    laneResonator: {},
    laneSampleNames: emptyBeatLaneSampleNames(),
    laneVariantNames: DRUM_LANES.reduce((acc, lane) => {
      acc[lane] = [];
      return acc;
    }, {} as Record<DrumKind, string[]>),
    laneEqSettings: emptyBeatLaneEqSettings(),
    laneFrequencyProfiles: emptyBeatLaneFrequencyProfiles(),
    stepOptions: {},
    bankStepOptions: { A: {}, B: {}, C: {}, D: {} },
    swing: 0,
    humanizeMs: 0,
    stutter: 0,
    fillsEnabled: false,
    queuedBank: null,
    fillPreset: "simple",
  };
  private beatLaneSamples: Record<DrumKind, AudioBuffer | null> = DRUM_LANES.reduce((acc, lane) => {
    acc[lane] = null;
    return acc;
  }, {} as Record<DrumKind, AudioBuffer | null>);
  /** Round-robin variant buffers per lane (up to 3). The primary buffer
   *  is in beatLaneSamples; this holds the alternates. Cycled via
   *  beatLaneVariantCursor on each consecutive hit. */
  private beatLaneVariants: Record<DrumKind, AudioBuffer[]> = DRUM_LANES.reduce((acc, lane) => {
    acc[lane] = [];
    return acc;
  }, {} as Record<DrumKind, AudioBuffer[]>);
  private beatLaneVariantCursor: Record<DrumKind, number> = DRUM_LANES.reduce((acc, lane) => {
    acc[lane] = 0;
    return acc;
  }, {} as Record<DrumKind, number>);
  /** Cache of reversed AudioBuffers, keyed by the source buffer. Built
   *  lazily on the first hit that needs a reverse, then re-used until
   *  the lane sample changes. WeakMap so swapping the primary sample
   *  releases the old reversed copy without us tracking lifecycles. */
  private reversedBufferCache: WeakMap<AudioBuffer, AudioBuffer> = new WeakMap();
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
    glideSec: 0,
    filterVelocityModHz: 0,
    activeNotes: [],
    recordingClip: false,
    clip: null,
  };
  /** Frequency of the most recently triggered synth note. Used as the
   *  start frequency when glideSec > 0 so each new note slides from the
   *  previous pitch. null = no prior note (first note ever, or after a
   *  global stop). */
  private lastSynthFreq: number | null = null;
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
    inputMonitorMode: "low-latency",
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
    masterTapeDrive: 0,
    masterLimiterReduction: 0,
    masterPhaseCorrelation: 1,
    soloMode: "sip",
    aflBusLevel: 0,
    monoPreviewOn: false,
    vcaGroups: [],
    referenceEnabled: false,
    referenceMatchDb: 0,
    punchInEnabled: false,
    punchInSec: 0,
    punchOutSec: 4,
    countInEnabled: true,
    countInBars: 1,
    countInRemainingBeats: 0,
    preRollSec: 1.5,
    loopRecordEnabled: false,
    maxLoopTakes: 6,
    captureBackend: "mediarecorder",
    lastRecordedTrackId: null,
  };

  private playStartCtxTime = 0;
  private playStartPosition = 0;
  /** Alignment trim to compensate MediaRecorder starting before scheduled playback. */
  private recordingAlignmentTrimSec = 0;
  /** Guards against overlapping async start/stop recording transitions. */
  private recordingStartInFlight = false;
  private recordingStopInFlight = false;
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
      // Pro audio defaults: 48 kHz is the studio/video standard and the
      // sweet spot of CPU-vs-quality. Browsers may fall back to the device
      // rate if 48 kHz isn't supported — the engine reads ctx.sampleRate
      // everywhere, so a fallback is harmless.
      this.ctx = new Ctor({
        latencyHint: this.transport.latencyMode === "recording" ? "interactive" : "playback",
        sampleRate: 48000,
      });
      this.audioContext = this.ctx;
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
      // Master tape saturator (#15) — a WaveShaperNode sitting between
      // the master EQ and the limiter. Curve starts as a passthrough
      // (identity) so the chain is bit-perfect when drive is 0. Drive
      // > 0 swaps in a tanh-based curve scaled by drive amount; even
      // harmonics fatten the mix without ringing. 4x oversampling
      // matches the vocal bus to avoid aliasing on a busy master.
      this.masterTape = this.ctx.createWaveShaper();
      // Drive 0 → identity curve (buildConsoleSaturationCurve special-cases
      // it for bit-perfect bypass). Live drive lands via setMasterTapeDrive.
      this.masterTape.curve = buildConsoleSaturationCurve(0);
      this.masterTape.oversample = "4x";
      this.masterAnalyser = this.ctx.createAnalyser();
      this.masterAnalyser.fftSize = 512;
      this.masterMeterBuf = new Uint8Array(this.masterAnalyser.fftSize);
      this.aflBusAnalyser = this.ctx.createAnalyser();
      this.aflBusAnalyser.fftSize = 512;
      this.aflBusBuf = new Uint8Array(this.aflBusAnalyser.fftSize);
      this.monitorOutGain = this.ctx.createGain();
      this.monitorOutGain.gain.value = 1;
      this.referenceGain = this.ctx.createGain();
      this.referenceGain.gain.value = 0;
      this.monoOutGain = this.ctx.createGain();
      this.monoOutGain.gain.value = 0;
      this.monoSplitter = this.ctx.createChannelSplitter(2);
      this.monoMerger = this.ctx.createChannelMerger(2);
      this.monoSumGain = this.ctx.createGain();
      this.monoSumGain.gain.value = 0.5;
      this.phaseLeftAnalyser = this.ctx.createAnalyser();
      this.phaseLeftAnalyser.fftSize = 1024;
      this.phaseRightAnalyser = this.ctx.createAnalyser();
      this.phaseRightAnalyser.fftSize = 1024;
      this.phaseLeftBuf = new Float32Array(this.phaseLeftAnalyser.fftSize);
      this.phaseRightBuf = new Float32Array(this.phaseRightAnalyser.fftSize);
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
      // Wire master chain. Tape saturator sits between the EQ tap and
      // the limiter so the user can hit the limiter with a saturated
      // mix (a key "glue" trick). EQ analysers tap the EQ output —
      // before tape — so the spectrum + LUFS readings stay tonally
      // accurate regardless of saturation drive.
      this.master
        .connect(this.masterEqLow)
        .connect(this.masterEqMid)
        .connect(this.masterEqHigh)
        .connect(this.masterTape)
        .connect(this.masterLimiter)
        .connect(this.masterAnalyser);
      this.masterAnalyser.connect(this.monitorOutGain).connect(this.ctx.destination);
      this.referenceGain.connect(this.ctx.destination);
      this.masterAnalyser.connect(this.monoSplitter);
      this.monoSplitter.connect(this.monoSumGain, 0);
      this.monoSplitter.connect(this.monoSumGain, 1);
      this.monoSumGain.connect(this.monoMerger, 0, 0);
      this.monoSumGain.connect(this.monoMerger, 0, 1);
      this.monoMerger.connect(this.monoOutGain).connect(this.ctx.destination);
      this.monoSplitter.connect(this.phaseLeftAnalyser, 0);
      this.monoSplitter.connect(this.phaseRightAnalyser, 1);
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
      this.applyReferenceMonitoring();
      this.applyInputMonitorMode();
      this.startMeterLoop();
      return true;
    } catch (err) {
      console.warn("[DawEngine] init failed", err);
      return false;
    }
  }

  private startMeterLoop() {
    // The meter loop only needs to run when there's actually audio
    // moving — during playback, while recording (so arm-state level
    // monitoring works), while the beat machine is enabled, or when
    // input monitoring is on. Otherwise we'd burn ~60Hz of CPU on a
    // silent UI just to read analyser nodes that report zero.
    const step = () => {
      if (!this.ctx) {
        this.rafId = null;
        return;
      }
      this.tick();
      if (!this.needsMeterTick()) {
        // Nothing is producing audio → park the loop. The next play /
        // arm / beat-enable will kick it back to life via kickMeterLoop.
        this.rafId = null;
        return;
      }
      this.rafId = requestAnimationFrame(step);
    };
    if (this.rafId !== null) return; // already running
    this.rafId = requestAnimationFrame(step);
  }

  /** Wake the meter loop from its idle state. Called whenever something
   *  flips that should trigger meter updates again (play, arm, beat
   *  enable, input monitor). Safe to call when the loop is already
   *  running — startMeterLoop guards against double-starting. */
  private kickMeterLoop() {
    if (this.rafId !== null) return;
    if (!this.ctx) return;
    this.startMeterLoop();
  }

  /** True when anything actively needs meter feedback. */
  private needsMeterTick(): boolean {
    if (this.transport.isPlaying) return true;
    if (this.transport.isRecording) return true;
    if (this.beatMachine.enabled) return true;
    // Any armed track wants live input level for the meter overlay.
    for (const t of this.tracks.values()) {
      if (t.state.armed) return true;
    }
    return false;
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
    // Master limiter gain reduction — DynamicsCompressorNode.reduction is
    // a negative dB value (0 = passthrough, -3 = pulling 3 dB out). When
    // the limiter is bypassed the node still runs so the value stays at 0.
    this.transport.masterLimiterReduction = this.masterLimiter?.reduction ?? 0;

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
      t.state.compGainReductionDb = t.comp.reduction ?? 0;

      t.eqAnalyser.getByteFrequencyData(
        t.eqSpectrumBuf as unknown as Uint8Array<ArrayBuffer>,
      );
      const eqBins = t.eqSpectrumBuf.length;
      const eqOut: number[] = [];
      for (let i = 0; i < 24; i++) {
        const lo = Math.floor(Math.pow(i / 24, 2) * eqBins);
        const hi = Math.floor(Math.pow((i + 1) / 24, 2) * eqBins);
        let v = 0;
        for (let j = lo; j < Math.max(lo + 1, hi); j++) {
          v = Math.max(v, t.eqSpectrumBuf[j] ?? 0);
        }
        eqOut.push(v / 255);
      }
      t.state.eqSpectrum = eqOut;
    }

    if (this.aflBusAnalyser && this.aflBusBuf && this.transport.soloMode === "afl") {
      this.aflBusAnalyser.getByteTimeDomainData(
        this.aflBusBuf as unknown as Uint8Array<ArrayBuffer>,
      );
      let aflPeak = 0;
      for (let i = 0; i < this.aflBusBuf.length; i++) {
        const v = Math.abs((this.aflBusBuf[i] ?? 128) - 128) / 128;
        if (v > aflPeak) aflPeak = v;
      }
      this.transport.aflBusLevel = aflPeak;
    } else {
      this.transport.aflBusLevel = 0;
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
      for (let i = 0; i < this.lufsBuf.length; i++) {
        const v = this.lufsBuf[i] ?? 0;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / this.lufsBuf.length);
      // LUFS approximation. -0.691 is the K-weighted offset baseline.
      this.transport.masterLufs = rms > 0 ? -0.691 + 10 * Math.log10(rms * rms) : -Infinity;
    }
    if (
      this.phaseLeftAnalyser &&
      this.phaseRightAnalyser &&
      this.phaseLeftBuf &&
      this.phaseRightBuf
    ) {
      this.phaseLeftAnalyser.getFloatTimeDomainData(
        this.phaseLeftBuf as unknown as Float32Array<ArrayBuffer>,
      );
      this.phaseRightAnalyser.getFloatTimeDomainData(
        this.phaseRightBuf as unknown as Float32Array<ArrayBuffer>,
      );
      let sumLR = 0;
      let sumL2 = 0;
      let sumR2 = 0;
      const len = Math.min(this.phaseLeftBuf.length, this.phaseRightBuf.length);
      for (let i = 0; i < len; i++) {
        const l = this.phaseLeftBuf[i] ?? 0;
        const r = this.phaseRightBuf[i] ?? 0;
        sumLR += l * r;
        sumL2 += l * l;
        sumR2 += r * r;
      }
      const denom = Math.sqrt(sumL2 * sumR2);
      this.transport.masterPhaseCorrelation = denom > 1e-8 ? Math.max(-1, Math.min(1, sumLR / denom)) : 1;
      const leftPeak = this.estimateOversampledTruePeak(this.phaseLeftBuf);
      const rightPeak = this.estimateOversampledTruePeak(this.phaseRightBuf);
      this.transport.masterTruePeak = Math.max(leftPeak, rightPeak);
    }

    // Update transport position when playing.
    if (this.transport.isPlaying) {
      const elapsed = Math.max(0, this.ctx.currentTime - this.playStartCtxTime);
      this.transport.positionSec = this.playStartPosition + elapsed;

      for (const t of this.tracks.values()) {
        const autoGain = this.automationValueAt(
          t.state.automation.gainDb,
          this.transport.positionSec,
          (p) => p.valueDb,
        );
        if (autoGain !== null) {
          t.state.gainDb = autoGain;
          if (!t.state.muted) {
            t.gainNode.gain.value = DB_TO_LINEAR(this.effectiveTrackGainDb(t));
          }
        }
        const autoPan = this.automationValueAt(
          t.state.automation.pan,
          this.transport.positionSec,
          (p) => p.value,
        );
        if (autoPan !== null) {
          t.state.pan = autoPan;
          t.panNode.pan.value = autoPan;
        }
      }

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

      this.checkPunchIn();
    }

    this.notify();
  }

  /** Automatically arm/disarm recording when punch-in is enabled and playback crosses the punch window. */
  private checkPunchIn(): void {
    if (!this.transport.punchInEnabled || !this.transport.isPlaying) return;
    if (this.recordingStartInFlight || this.recordingStopInFlight) return;
    const pos = this.transport.positionSec;
    if (!this.transport.isRecording) {
      if (pos >= this.transport.punchInSec && pos < this.transport.punchOutSec) {
        void this.startRecording();
      }
    } else {
      if (pos >= this.transport.punchOutSec) {
        void this.stopRecording();
      }
    }
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
    const eqAnalyser = ctx.createAnalyser();
    eqAnalyser.fftSize = 1024;
    eqAnalyser.smoothingTimeConstant = 0.75;
    const eqSpectrumBuf = new Uint8Array(eqAnalyser.frequencyBinCount);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.knee.value = 6;
    comp.attack.value = 0.005;
    comp.release.value = 0.1;
    // Comp bypass stays closed by default. When compression is disabled,
    // the compressor is slackened into a unity no-op instead of rewiring.
    const compBypass = ctx.createGain();
    compBypass.gain.value = 0; // start with bypass closed → comp engaged
    const compMix = ctx.createGain();

    const vocalBusDrive = ctx.createGain();
    vocalBusDrive.gain.value = 1;
    const vocalBusSaturator = ctx.createWaveShaper();
    vocalBusSaturator.curve = buildConsoleSaturationCurve(0);
    // 4x oversample kills aliasing above 8 kHz that 2x lets through when
    // drive is hot. CPU cost ~12% per saturated track — worth it for vocals.
    vocalBusSaturator.oversample = "4x";
    const vocalBusPresence = ctx.createBiquadFilter();
    vocalBusPresence.type = "peaking";
    vocalBusPresence.frequency.value = 3200;
    vocalBusPresence.Q.value = 0.85;
    const vocalBusAir = ctx.createBiquadFilter();
    vocalBusAir.type = "highshelf";
    vocalBusAir.frequency.value = 10500;
    // De-esser — a peaking notch at 6.5 kHz with Q=4 (~1/3 octave wide).
    // Starts at 0 dB (bypassed); when the user pulls it down (e.g., -6),
    // it dips the sibilance band on every "s/sh/ch" without dulling the
    // rest of the vocal. Lives after the air shelf so air can still
    // brighten high frequencies above 10 kHz independently.
    const vocalBusDeEss = ctx.createBiquadFilter();
    vocalBusDeEss.type = "peaking";
    vocalBusDeEss.frequency.value = 6500;
    vocalBusDeEss.Q.value = 4;
    vocalBusDeEss.gain.value = 0;
    const vocalBusDryGain = ctx.createGain();
    vocalBusDryGain.gain.value = 1;
    const vocalBusCrush = ctx.createDynamicsCompressor();
    vocalBusCrush.threshold.value = -30;
    vocalBusCrush.knee.value = 10;
    vocalBusCrush.ratio.value = 14;
    vocalBusCrush.attack.value = 0.002;
    vocalBusCrush.release.value = 0.07;
    const vocalBusCrushGain = ctx.createGain();
    vocalBusCrushGain.gain.value = 0;
    const vocalBusSum = ctx.createGain();

    const reverbSendGain = ctx.createGain();
    reverbSendGain.gain.value = 0;
    const delaySendGain = ctx.createGain();
    delaySendGain.gain.value = 0;

    const gainNode = ctx.createGain();
    const panNode = ctx.createStereoPanner();
    const monitorOutGain = ctx.createGain();
    monitorOutGain.gain.value = 1;
    const meterAnalyser = ctx.createAnalyser();
    meterAnalyser.fftSize = 256;
    const meterBuf = new Uint8Array(meterAnalyser.fftSize);

    // Wire FX chain.
    fxIn.connect(sidechainDuck);
    sidechainDuck.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(eqAnalyser);
    eqHigh.connect(comp);
    eqHigh.connect(compBypass); // parallel bypass path
    comp.connect(compMix);
    compBypass.connect(compMix);
    compMix.connect(vocalBusDrive);
    vocalBusDrive.connect(vocalBusSaturator);
    vocalBusSaturator.connect(vocalBusPresence);
    vocalBusPresence.connect(vocalBusAir);
    vocalBusAir.connect(vocalBusDeEss);
    vocalBusDeEss.connect(vocalBusDryGain);
    vocalBusDeEss.connect(vocalBusCrush);
    vocalBusDryGain.connect(vocalBusSum);
    vocalBusCrush.connect(vocalBusCrushGain);
    vocalBusCrushGain.connect(vocalBusSum);
    // Out the strip → fader / pan / meter / master. Time-based FX are
    // post-fader sends to shared aux returns.
    vocalBusSum.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(monitorOutGain);
    if (this.aflBusAnalyser) monitorOutGain.connect(this.aflBusAnalyser);
    monitorOutGain.connect(meterAnalyser);
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
        inputGainDb: -6,
        hasAudio: false,
        durationSec: 0,
        level: 0,
        eqSpectrum: new Array(24).fill(0),
        fx: { ...DEFAULT_TRACK_FX },
        sidechainFromId: null,
        sidechainAmount: 0.6,
        inputCalibrating: false,
        inputObservedPeak: 0,
        suggestedInputGainDb: null,
        compGainReductionDb: 0,
        vcaGroupId: null,
        automation: {
          gainDb: [],
          pan: [],
        },
        compLanes: [],
        compSegmentLaneIds: [],
        frozen: false,
      },
      fxIn,
      sidechainDuck,
      eqLow,
      eqMid,
      eqHigh,
      eqAnalyser,
      eqSpectrumBuf,
      comp,
      compBypass,
      compMix,
      vocalBusDrive,
      vocalBusSaturator,
      vocalBusPresence,
      vocalBusAir,
      vocalBusDeEss,
      vocalBusDryGain,
      vocalBusCrush,
      vocalBusCrushGain,
      vocalBusSum,
      reverbSendGain,
      delaySendGain,
      gainNode,
      panNode,
      monitorOutGain,
      meterAnalyser,
      meterBuf,
      buffer: null,
      previousBuffer: null,
      blob: null,
      source: null,
      liveSource: null,
      liveStream: null,
      inputGain: null,
      monitorGain: null,
      monitorLatencyDelay: null,
      monitorToneFilter: null,
      recorder: null,
      recordedChunks: [],
      preRollChunks: [],
      preRollFrames: 0,
      activeTakeChunks: [],
      captureActive: false,
      inputTap: null,
      inputTapSink: null,
      inputCalibrationStartedAtMs: null,
      inputCalibrationPeak: 0,
      webCodecEncoder: null,
      webCodecChunks: [],
      webCodecInputFrames: 0,
      webCodecSampleRate: 0,
      captureBackend: "mediarecorder",
      compLaneBuffers: [],
      compSegmentLaneIds: [],
      preFreezeBuffer: null,
      preFreezeFx: null,
      preFreezeGainDb: null,
      preFreezePan: null,
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

  setTrackEq(id: TrackId, band: EqBand, db: number) {
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

  setTrackComp(
    id: TrackId,
    params: {
      threshDb?: number;
      ratio?: number;
      enabled?: boolean;
      parallelBlend?: number;
    },
  ) {
    const t = this.tracks.get(id);
    if (!t) return;
    if (params.threshDb !== undefined) {
      const clamped = Math.max(-60, Math.min(0, params.threshDb));
      t.state.fx.compThreshDb = clamped;
    }
    if (params.ratio !== undefined) {
      const clamped = Math.max(1, Math.min(20, params.ratio));
      t.state.fx.compRatio = clamped;
    }
    if (params.enabled !== undefined) {
      t.state.fx.compEnabled = params.enabled;
    }
    if (params.parallelBlend !== undefined) {
      t.state.fx.compParallelBlend = Math.max(
        0,
        Math.min(1, params.parallelBlend),
      );
    }
    const now = this.ctx!.currentTime;
    const targetThreshold = t.state.fx.compEnabled ? t.state.fx.compThreshDb : 0;
    const targetRatio = t.state.fx.compEnabled ? t.state.fx.compRatio : 1;
    t.comp.threshold.cancelScheduledValues(now);
    t.comp.threshold.setValueAtTime(t.comp.threshold.value, now);
    t.comp.threshold.linearRampToValueAtTime(targetThreshold, now + 0.02);
    t.comp.ratio.cancelScheduledValues(now);
    t.comp.ratio.setValueAtTime(t.comp.ratio.value, now);
    t.comp.ratio.linearRampToValueAtTime(targetRatio, now + 0.02);
    // Parallel comp blend: when blend=0 we behave exactly as before
    // (comp on → all comp, comp off → all dry). When blend>0 we mix
    // some unprocessed dry signal back in even while compressing —
    // classic NY-style "punch on top of dry" sound. The blend is only
    // meaningful when comp is enabled; with comp off the dry path is
    // 100% already.
    const blend = t.state.fx.compEnabled ? t.state.fx.compParallelBlend : 0;
    const compLevel = t.state.fx.compEnabled ? 1 - blend * 0.5 : 0;
    const dryLevel = t.state.fx.compEnabled ? blend : 1;
    t.compBypass.gain.cancelScheduledValues(now);
    t.compBypass.gain.setValueAtTime(t.compBypass.gain.value, now);
    t.compBypass.gain.linearRampToValueAtTime(dryLevel, now + 0.02);
    t.compMix.gain.cancelScheduledValues(now);
    t.compMix.gain.setValueAtTime(t.compMix.gain.value, now);
    t.compMix.gain.linearRampToValueAtTime(compLevel, now + 0.02);
    this.notify();
  }

  setTrackVocalBus(
    id: TrackId,
    params: {
      enabled?: boolean;
      driveDb?: number;
      presenceDb?: number;
      airDb?: number;
      crush?: number;
      deEssDb?: number;
    },
  ) {
    const t = this.tracks.get(id);
    if (!t) return;
    if (params.enabled !== undefined) t.state.fx.vocalBusEnabled = params.enabled;
    if (params.driveDb !== undefined) {
      t.state.fx.vocalBusDriveDb = Math.max(0, Math.min(18, params.driveDb));
    }
    if (params.presenceDb !== undefined) {
      t.state.fx.vocalBusPresenceDb = Math.max(-6, Math.min(6, params.presenceDb));
    }
    if (params.airDb !== undefined) {
      t.state.fx.vocalBusAirDb = Math.max(-6, Math.min(8, params.airDb));
    }
    if (params.crush !== undefined) {
      t.state.fx.vocalBusCrush = Math.max(0, Math.min(1, params.crush));
    }
    if (params.deEssDb !== undefined) {
      // Clamp to -12..0 — the de-esser is cut-only by design; a "boost"
      // here would just be a presence shelf, which already exists.
      t.state.fx.vocalBusDeEssDb = Math.max(-12, Math.min(0, params.deEssDb));
    }
    this.applyVocalBusState(t);
    this.notify();
  }

  private applyVocalBusState(t: TrackInternal) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const fx = completeTrackFx(t.state.fx);
    t.state.fx = fx;
    const enabled = fx.vocalBusEnabled;
    const driveDb = enabled ? fx.vocalBusDriveDb : 0;
    const crush = enabled ? fx.vocalBusCrush : 0;
    t.vocalBusDrive.gain.cancelScheduledValues(now);
    t.vocalBusDrive.gain.setValueAtTime(t.vocalBusDrive.gain.value, now);
    t.vocalBusDrive.gain.linearRampToValueAtTime(DB_TO_LINEAR(driveDb), now + 0.02);
    t.vocalBusSaturator.curve = buildConsoleSaturationCurve(driveDb / 18);
    t.vocalBusPresence.gain.cancelScheduledValues(now);
    t.vocalBusPresence.gain.setValueAtTime(t.vocalBusPresence.gain.value, now);
    t.vocalBusPresence.gain.linearRampToValueAtTime(
      enabled ? fx.vocalBusPresenceDb : 0,
      now + 0.02,
    );
    t.vocalBusAir.gain.cancelScheduledValues(now);
    t.vocalBusAir.gain.setValueAtTime(t.vocalBusAir.gain.value, now);
    t.vocalBusAir.gain.linearRampToValueAtTime(enabled ? fx.vocalBusAirDb : 0, now + 0.02);
    // De-esser is cut-only — clamp at <=0 dB regardless of input. When
    // the vocal bus is bypassed we ramp to 0 so the chain becomes a
    // straight passthrough.
    const deEssDb = enabled ? Math.min(0, fx.vocalBusDeEssDb ?? 0) : 0;
    t.vocalBusDeEss.gain.cancelScheduledValues(now);
    t.vocalBusDeEss.gain.setValueAtTime(t.vocalBusDeEss.gain.value, now);
    t.vocalBusDeEss.gain.linearRampToValueAtTime(deEssDb, now + 0.02);
    t.vocalBusDryGain.gain.cancelScheduledValues(now);
    t.vocalBusDryGain.gain.setValueAtTime(t.vocalBusDryGain.gain.value, now);
    t.vocalBusDryGain.gain.linearRampToValueAtTime(enabled ? 0.96 - crush * 0.14 : 1, now + 0.02);
    t.vocalBusCrushGain.gain.cancelScheduledValues(now);
    t.vocalBusCrushGain.gain.setValueAtTime(t.vocalBusCrushGain.gain.value, now);
    t.vocalBusCrushGain.gain.linearRampToValueAtTime(enabled ? crush * 0.7 : 0, now + 0.02);
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
      const target = on ? 0.7 : 0;
      const now = this.ctx.currentTime;
      // Cancel any in-flight ramp before starting a new one — otherwise
      // rapid toggles compound into surprising values.
      t.monitorGain.gain.cancelScheduledValues(now);
      t.monitorGain.gain.setValueAtTime(t.monitorGain.gain.value, now);
      t.monitorGain.gain.linearRampToValueAtTime(target, now + 0.03);
    }
    this.notify();
  }

  /** Adjust the mic input trim for a track. Range is clamped to
   *  -24..+12 dB. Persists in TrackState so the value survives a
   *  stop/start of recording, and applies live if the track currently
   *  has a recording chain spun up. */
  setTrackInputGain(id: TrackId, db: number) {
    const t = this.tracks.get(id);
    if (!t) return;
    const clamped = Math.max(-24, Math.min(12, db));
    t.state.inputGainDb = clamped;
    if (t.inputGain && this.ctx) {
      const target = DB_TO_LINEAR(clamped);
      const now = this.ctx.currentTime;
      t.inputGain.gain.cancelScheduledValues(now);
      t.inputGain.gain.setValueAtTime(t.inputGain.gain.value, now);
      t.inputGain.gain.linearRampToValueAtTime(target, now + 0.03);
    }
    this.notify();
  }

  setSoloMode(mode: "sip" | "afl") {
    this.transport.soloMode = mode;
    this.applySoloMuteRouting();
    this.notify();
  }

  setTrackGroup(id: TrackId, groupId: string | null) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.state.vcaGroupId = groupId;
    if (groupId && !this.transport.vcaGroups.some((g) => g.id === groupId)) {
      this.transport.vcaGroups.push({ id: groupId, name: groupId.toUpperCase(), gainDb: 0 });
    }
    this.applySoloMuteRouting();
    this.notify();
  }

  setVcaGroupGain(groupId: string, gainDb: number) {
    const clamped = Math.max(-60, Math.min(6, gainDb));
    const group = this.transport.vcaGroups.find((entry) => entry.id === groupId);
    if (group) {
      group.gainDb = clamped;
    } else {
      this.transport.vcaGroups.push({ id: groupId, name: groupId.toUpperCase(), gainDb: clamped });
    }
    this.applySoloMuteRouting();
    this.notify();
  }

  setVcaGroupName(groupId: string, name: string) {
    const group = this.transport.vcaGroups.find((entry) => entry.id === groupId);
    if (!group) return;
    group.name = name.trim().slice(0, 20) || group.name;
    this.notify();
  }

  setTrackAutomationPoint(
    id: TrackId,
    lane: "gainDb" | "pan",
    timeSec: number,
    value: number,
  ) {
    const t = this.tracks.get(id);
    if (!t) return;
    const safeTime = Math.max(0, timeSec);
    if (lane === "gainDb") {
      const safeValue = Math.max(-60, Math.min(6, value));
      const rest = t.state.automation.gainDb.filter((p) => Math.abs(p.timeSec - safeTime) > 0.001);
      rest.push({ timeSec: safeTime, valueDb: safeValue });
      rest.sort((a, b) => a.timeSec - b.timeSec);
      t.state.automation.gainDb = rest;
    } else {
      const safeValue = Math.max(-1, Math.min(1, value));
      const rest = t.state.automation.pan.filter((p) => Math.abs(p.timeSec - safeTime) > 0.001);
      rest.push({ timeSec: safeTime, value: safeValue });
      rest.sort((a, b) => a.timeSec - b.timeSec);
      t.state.automation.pan = rest;
    }
    this.notify();
  }

  clearTrackAutomation(id: TrackId, lane?: "gainDb" | "pan") {
    const t = this.tracks.get(id);
    if (!t) return;
    if (!lane || lane === "gainDb") t.state.automation.gainDb = [];
    if (!lane || lane === "pan") t.state.automation.pan = [];
    this.notify();
  }

  private vcaGainDbForTrack(t: TrackInternal): number {
    if (!t.state.vcaGroupId) return 0;
    return this.transport.vcaGroups.find((g) => g.id === t.state.vcaGroupId)?.gainDb ?? 0;
  }

  private effectiveTrackGainDb(t: TrackInternal): number {
    return t.state.gainDb + this.vcaGainDbForTrack(t);
  }

  private automationValueAt<T extends { timeSec: number }>(
    points: T[],
    timeSec: number,
    readValue: (p: T) => number,
  ): number | null {
    if (points.length === 0) return null;
    if (timeSec <= points[0]!.timeSec) return readValue(points[0]!);
    if (timeSec >= points[points.length - 1]!.timeSec) return readValue(points[points.length - 1]!);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      if (timeSec >= a.timeSec && timeSec <= b.timeSec) {
        const span = Math.max(1e-6, b.timeSec - a.timeSec);
        const k = (timeSec - a.timeSec) / span;
        return readValue(a) * (1 - k) + readValue(b) * k;
      }
    }
    return null;
  }

  // ── Track audio I/O — programmatic buffer attach (used by beat render) ───

  /** Read-only view of a track's AudioBuffer. Used by the pitch-correct
   *  flow (#13) which clones, processes, and writes back via
   *  setTrackBuffer. Returns null when the track has no audio. */
  getTrackBuffer(id: TrackId): AudioBuffer | null {
    const t = this.tracks.get(id);
    return t?.buffer ?? null;
  }

  /** Cheap per-take peak summary for the take-lanes strip UI. Returns a
   *  fixed-length array of normalized peaks (0..1) per lane so each
   *  take row can render a miniature waveform without exposing the full
   *  Float32 buffer. Empty array when the track has no takes. */
  getCompLanePeaks(trackId: TrackId, bins = 80): Array<{ id: string; peaks: number[] }> {
    const t = this.tracks.get(trackId);
    if (!t) return [];
    return t.compLaneBuffers.map((lane) => {
      const data = lane.buffer.getChannelData(0);
      const peaks: number[] = new Array(bins).fill(0);
      const binSize = Math.max(1, Math.floor(data.length / bins));
      for (let i = 0; i < bins; i++) {
        let peak = 0;
        const start = i * binSize;
        const end = Math.min(data.length, start + binSize);
        for (let j = start; j < end; j++) {
          const v = Math.abs(data[j] ?? 0);
          if (v > peak) peak = v;
        }
        peaks[i] = Math.min(1, peak);
      }
      return { id: lane.id, peaks };
    });
  }

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
    t.gainNode.gain.value = t.state.muted ? 0 : DB_TO_LINEAR(this.effectiveTrackGainDb(t));
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
    if (armed) {
      void this.ensureTrackInputPipeline(t);
      // Arming a track means live-input level monitoring should run.
      // Kick the meter loop in case it was parked at idle.
      this.kickMeterLoop();
    } else if (!this.transport.isRecording) {
      this.teardownTrackInputPipeline(t);
    }
    this.notify();
  }

  private canUseWebCodecsCapture(): boolean {
    const g = globalThis as unknown as {
      AudioEncoder?: unknown;
      AudioData?: unknown;
    };
    return Boolean(g.AudioEncoder && g.AudioData);
  }

  private canAccessMicrophone(): boolean {
    if (typeof document === "undefined") return true;
    // Some embedded browsers/webviews enforce Permissions-Policy and will
    // hard-fail getUserMedia("microphone") with noisy console violations.
    const doc = document as Document & {
      permissionsPolicy?: { allowsFeature?: (feature: string) => boolean };
      featurePolicy?: { allowsFeature?: (feature: string) => boolean };
    };
    const policy = doc.permissionsPolicy ?? doc.featurePolicy;
    const allowsFeature = policy?.allowsFeature;
    if (typeof allowsFeature !== "function") return true;
    try {
      return allowsFeature.call(policy, "microphone") !== false;
    } catch {
      return true;
    }
  }

  private async ensureTrackInputPipeline(t: TrackInternal): Promise<boolean> {
    if (!this.ctx) return false;
    if (t.liveStream && t.liveSource && t.inputGain && t.monitorGain) {
      this.beginInputCalibration(t);
      return true;
    }
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      return false;
    }
    if (!this.canAccessMicrophone()) {
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: this.ctx.sampleRate,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      t.liveStream = stream;
      const live = this.ctx.createMediaStreamSource(stream);
      const inputGain = this.ctx.createGain();
      inputGain.gain.value = DB_TO_LINEAR(t.state.inputGainDb);
      const monitorDelay = this.ctx.createDelay(0.2);
      monitorDelay.delayTime.value =
        this.transport.inputMonitorMode === "low-latency" ? 0.004 : 0.042;
      const monitorTone = this.ctx.createBiquadFilter();
      monitorTone.type = "lowpass";
      monitorTone.frequency.value =
        this.transport.inputMonitorMode === "low-latency" ? 18000 : 12000;
      const monitorGain = this.ctx.createGain();
      monitorGain.gain.value = t.state.monitorEnabled ? 0.7 : 0;

      const inputTap = this.ctx.createScriptProcessor(1024, 1, 1);
      const inputTapSink = this.ctx.createGain();
      inputTapSink.gain.value = 0;

      live.connect(inputGain);
      inputGain.connect(monitorDelay);
      monitorDelay.connect(monitorTone);
      monitorTone.connect(monitorGain);
      monitorGain.connect(t.fxIn);
      inputGain.connect(inputTap);
      inputTap.connect(inputTapSink);
      inputTapSink.connect(this.ctx.destination);

      t.liveSource = live;
      t.inputGain = inputGain;
      t.monitorLatencyDelay = monitorDelay;
      t.monitorToneFilter = monitorTone;
      t.monitorGain = monitorGain;
      t.inputTap = inputTap;
      t.inputTapSink = inputTapSink;
      t.preRollChunks = [];
      t.preRollFrames = 0;
      t.activeTakeChunks = [];

      inputTap.onaudioprocess = (evt) => {
        const data = evt.inputBuffer.getChannelData(0);
        if (!data || data.length === 0) return;
        const chunk = new Float32Array(data.length);
        chunk.set(data);

        const maxPreRollFrames = Math.floor(
          (this.transport.preRollSec || 0) * this.ctx!.sampleRate,
        );
        if (maxPreRollFrames > 0 && !t.captureActive) {
          t.preRollChunks.push(chunk);
          t.preRollFrames += chunk.length;
          while (t.preRollFrames > maxPreRollFrames && t.preRollChunks.length > 0) {
            const removed = t.preRollChunks.shift();
            t.preRollFrames -= removed?.length ?? 0;
          }
        }

        if (t.captureActive) {
          t.activeTakeChunks.push(chunk);
          if (t.captureBackend === "webcodecs-opus") {
            this.encodeWebCodecsChunk(t, chunk);
          }
        }

        if (t.state.inputCalibrating) {
          let localPeak = 0;
          for (let i = 0; i < chunk.length; i++) {
            const abs = Math.abs(chunk[i] ?? 0);
            if (abs > localPeak) localPeak = abs;
          }
          if (localPeak > t.inputCalibrationPeak) {
            t.inputCalibrationPeak = localPeak;
          }
        }
      };

      this.beginInputCalibration(t);
      return true;
    } catch {
      return false;
    }
  }

  private beginInputCalibration(t: TrackInternal) {
    t.state.inputCalibrating = true;
    t.state.inputObservedPeak = 0;
    t.state.suggestedInputGainDb = null;
    t.inputCalibrationPeak = 0;
    t.inputCalibrationStartedAtMs = Date.now();
    this.notify();
    window.setTimeout(() => {
      if (!t.state.inputCalibrating) return;
      const peak = Math.max(0, Math.min(1, t.inputCalibrationPeak));
      t.state.inputCalibrating = false;
      t.state.inputObservedPeak = peak;
      if (peak > 0) {
        const target = 0.78;
        const deltaDb = 20 * Math.log10(target / peak);
        t.state.suggestedInputGainDb = Math.max(
          -24,
          Math.min(12, t.state.inputGainDb + deltaDb),
        );
      } else {
        t.state.suggestedInputGainDb = t.state.inputGainDb;
      }
      this.notify();
    }, 2000);
  }

  private teardownTrackInputPipeline(t: TrackInternal) {
    if (t.captureActive) return;
    t.inputTap && (t.inputTap.onaudioprocess = null);
    t.inputTap?.disconnect();
    t.inputTapSink?.disconnect();
    t.liveSource?.disconnect();
    t.inputGain?.disconnect();
    t.monitorLatencyDelay?.disconnect();
    t.monitorToneFilter?.disconnect();
    t.monitorGain?.disconnect();
    t.inputTap = null;
    t.inputTapSink = null;
    t.liveSource = null;
    t.inputGain = null;
    t.monitorLatencyDelay = null;
    t.monitorToneFilter = null;
    t.monitorGain = null;
    if (t.liveStream) {
      t.liveStream.getTracks().forEach((s) => s.stop());
      t.liveStream = null;
    }
    t.state.inputCalibrating = false;
    if (t.webCodecEncoder) {
      try {
        t.webCodecEncoder.close();
      } catch {
        /* no-op */
      }
      t.webCodecEncoder = null;
      t.webCodecChunks = [];
      t.webCodecInputFrames = 0;
      t.webCodecSampleRate = 0;
    }
  }

  private async startWebCodecsCapture(t: TrackInternal): Promise<boolean> {
    if (!this.ctx) return false;
    const g = globalThis as unknown as {
      AudioEncoder?: {
        new (init: {
          output: (chunk: {
            byteLength: number;
            type: "key" | "delta";
            timestamp: number;
            duration?: number;
            copyTo: (dst: Uint8Array) => void;
          }) => void;
          error: (error: unknown) => void;
        }): {
          configure: (cfg: {
            codec: string;
            numberOfChannels: number;
            sampleRate: number;
            bitrate: number;
          }) => void;
          encode: (data: unknown) => void;
          flush: () => Promise<void>;
          close: () => void;
          state?: string;
        };
      };
    };
    if (!g.AudioEncoder) return false;

    t.webCodecChunks = [];
    t.webCodecInputFrames = 0;
    t.webCodecSampleRate = this.ctx.sampleRate;

    try {
      const encoder = new g.AudioEncoder({
        output: (chunk) => {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          t.webCodecChunks.push({
            type: chunk.type,
            timestamp: chunk.timestamp,
            duration: chunk.duration ?? 0,
            data,
          });
        },
        error: (error) => {
          console.warn("[DawEngine] webcodecs encoder error", error);
        },
      });
      encoder.configure({
        codec: "opus",
        numberOfChannels: 1,
        sampleRate: this.ctx.sampleRate,
        bitrate: 256_000,
      });
      t.webCodecEncoder = encoder;
      return true;
    } catch (error) {
      console.warn("[DawEngine] webcodecs init failed", error);
      t.webCodecEncoder = null;
      t.webCodecChunks = [];
      return false;
    }
  }

  private encodeWebCodecsChunk(t: TrackInternal, chunk: Float32Array) {
    const g = globalThis as unknown as {
      AudioData?: {
        new (init: {
          format: "f32";
          sampleRate: number;
          numberOfFrames: number;
          numberOfChannels: number;
          timestamp: number;
          data: Float32Array;
        }): { close: () => void };
      };
    };
    if (!t.webCodecEncoder || !g.AudioData) return;
    try {
      const timestampUs = Math.round((t.webCodecInputFrames / t.webCodecSampleRate) * 1_000_000);
      const frame = new g.AudioData({
        format: "f32",
        sampleRate: t.webCodecSampleRate,
        numberOfFrames: chunk.length,
        numberOfChannels: 1,
        timestamp: timestampUs,
        data: chunk,
      });
      t.webCodecEncoder.encode(frame);
      frame.close();
      t.webCodecInputFrames += chunk.length;
    } catch (error) {
      console.warn("[DawEngine] webcodecs encode chunk failed", error);
    }
  }

  private async stopWebCodecsCapture(t: TrackInternal): Promise<AudioBuffer | null> {
    const encoder = t.webCodecEncoder;
    t.webCodecEncoder = null;
    if (!encoder) return null;
    try {
      if (encoder.state !== "closed") {
        await encoder.flush();
      }
    } catch (error) {
      console.warn("[DawEngine] webcodecs flush failed", error);
    }
    try {
      if (encoder.state !== "closed") {
        encoder.close();
      }
    } catch {
      /* no-op */
    }
    const decoded = await this.decodeWebCodecsChunks(
      t.webCodecChunks,
      t.webCodecSampleRate || this.ctx?.sampleRate || 48_000,
    );
    t.webCodecChunks = [];
    t.webCodecInputFrames = 0;
    t.webCodecSampleRate = 0;
    return decoded;
  }

  private async decodeWebCodecsChunks(
    chunks: Array<{
      type: "key" | "delta";
      timestamp: number;
      duration: number;
      data: Uint8Array;
    }>,
    sampleRate: number,
  ): Promise<AudioBuffer | null> {
    if (!this.ctx || chunks.length === 0) return null;
    const g = globalThis as unknown as {
      AudioDecoder?: {
        new (init: {
          output: (data: {
            numberOfFrames: number;
            copyTo: (dst: Float32Array, opts?: { planeIndex?: number }) => void;
            close: () => void;
          }) => void;
          error: (error: unknown) => void;
        }): {
          configure: (cfg: {
            codec: string;
            numberOfChannels: number;
            sampleRate: number;
          }) => void;
          decode: (chunk: unknown) => void;
          flush: () => Promise<void>;
          close: () => void;
        };
      };
      EncodedAudioChunk?: {
        new (init: {
          type: "key" | "delta";
          timestamp: number;
          duration: number;
          data: Uint8Array;
        }): unknown;
      };
    };
    if (!g.AudioDecoder || !g.EncodedAudioChunk) return null;

    const pcm: Float32Array[] = [];
    try {
      const decoder = new g.AudioDecoder({
        output: (data) => {
          const out = new Float32Array(data.numberOfFrames);
          try {
            data.copyTo(out, { planeIndex: 0 });
          } catch {
            data.copyTo(out);
          }
          pcm.push(out);
          data.close();
        },
        error: (error) => {
          console.warn("[DawEngine] webcodecs decoder error", error);
        },
      });
      decoder.configure({
        codec: "opus",
        numberOfChannels: 1,
        sampleRate,
      });
      for (const chunk of chunks) {
        const encoded = new g.EncodedAudioChunk({
          type: chunk.type,
          timestamp: chunk.timestamp,
          duration: chunk.duration,
          data: chunk.data,
        });
        decoder.decode(encoded);
      }
      await decoder.flush();
      decoder.close();
      return this.bufferFromMonoPcm(pcm, sampleRate);
    } catch (error) {
      console.warn("[DawEngine] webcodecs decode failed", error);
      return null;
    }
  }

  /** When ANY track is solo'd, only solo'd tracks should be audible.
   *  Otherwise muted state controls audibility. Recompute every track's
   *  effective gain whenever solo/mute state changes. */
  private applySoloMuteRouting() {
    const anySolo = Array.from(this.tracks.values()).some((t) => t.state.solo);
    for (const t of this.tracks.values()) {
      const baseOn = !t.state.muted;
      if (!anySolo) {
        t.gainNode.gain.value = baseOn ? DB_TO_LINEAR(this.effectiveTrackGainDb(t)) : 0;
        t.monitorOutGain.gain.value = 1;
        continue;
      }
      if (this.transport.soloMode === "sip") {
        const audible = baseOn && t.state.solo;
        t.gainNode.gain.value = audible ? DB_TO_LINEAR(this.effectiveTrackGainDb(t)) : 0;
        t.monitorOutGain.gain.value = 1;
      } else {
        t.gainNode.gain.value = baseOn ? DB_TO_LINEAR(this.effectiveTrackGainDb(t)) : 0;
        t.monitorOutGain.gain.value = t.state.solo ? 1 : 0;
      }
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
    this.transport.inputMonitorMode = mode === "recording" ? "low-latency" : "high-quality";
    this.applyInputMonitorMode();
    this.notify();
  }

  setInputMonitorMode(mode: TransportState["inputMonitorMode"]) {
    this.transport.inputMonitorMode = mode;
    this.applyInputMonitorMode();
    this.notify();
  }

  private applyInputMonitorMode() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const isLowLatency = this.transport.inputMonitorMode === "low-latency";
    const delaySec = isLowLatency ? 0.004 : 0.042;
    const toneHz = isLowLatency ? 18000 : 12000;
    for (const t of this.tracks.values()) {
      if (t.monitorLatencyDelay) {
        t.monitorLatencyDelay.delayTime.cancelScheduledValues(now);
        t.monitorLatencyDelay.delayTime.setValueAtTime(t.monitorLatencyDelay.delayTime.value, now);
        t.monitorLatencyDelay.delayTime.linearRampToValueAtTime(delaySec, now + 0.03);
      }
      if (t.monitorToneFilter) {
        t.monitorToneFilter.frequency.cancelScheduledValues(now);
        t.monitorToneFilter.frequency.setValueAtTime(t.monitorToneFilter.frequency.value, now);
        t.monitorToneFilter.frequency.linearRampToValueAtTime(toneHz, now + 0.03);
      }
    }
  }

  setCountIn(enabled: boolean, bars?: 1 | 2) {
    this.transport.countInEnabled = enabled;
    if (bars !== undefined) this.transport.countInBars = bars;
    this.notify();
  }

  setPreRoll(seconds: number) {
    const clamped = Math.max(0, Math.min(2, seconds));
    this.transport.preRollSec = clamped;
    this.notify();
  }

  setLoopRecording(enabled: boolean, maxTakes?: number) {
    this.transport.loopRecordEnabled = enabled;
    if (typeof maxTakes === "number" && Number.isFinite(maxTakes)) {
      this.transport.maxLoopTakes = Math.max(1, Math.min(16, Math.floor(maxTakes)));
    }
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

  setMonoPreview(on: boolean) {
    this.transport.monoPreviewOn = on;
    this.applyReferenceMonitoring();
    if (this.monoOutGain) this.monoOutGain.gain.value = on ? 1 : 0;
    this.notify();
  }

  /** Master tape saturation drive 0..1 (#15). 0 swaps in the identity
   *  curve for a bit-perfect bypass; >0 swaps in the console-style
   *  curve scaled by drive amount. */
  setMasterTapeDrive(drive: number) {
    const clamped = Math.max(0, Math.min(1, drive));
    this.transport.masterTapeDrive = clamped;
    if (this.masterTape) {
      this.masterTape.curve = buildConsoleSaturationCurve(clamped);
    }
    this.notify();
  }

  async setReferenceTrack(file: Blob): Promise<boolean> {
    if (!this.ctx) return false;
    try {
      const data = await file.arrayBuffer();
      this.referenceBuffer = await this.ctx.decodeAudioData(data.slice(0));
      if (this.transport.referenceEnabled) {
        this.syncReferenceSource();
      }
      this.notify();
      return true;
    } catch (error) {
      console.warn("[DawEngine] reference decode failed", error);
      return false;
    }
  }

  clearReferenceTrack() {
    this.stopReferenceSource();
    this.referenceBuffer = null;
    this.transport.referenceEnabled = false;
    this.applyReferenceMonitoring();
    this.notify();
  }

  setReferenceEnabled(on: boolean) {
    this.transport.referenceEnabled = on && Boolean(this.referenceBuffer);
    this.applyReferenceMonitoring();
    if (this.transport.referenceEnabled && this.transport.isPlaying) {
      this.syncReferenceSource();
    } else if (!this.transport.referenceEnabled) {
      this.stopReferenceSource();
    }
    this.notify();
  }

  setReferenceMatchDb(db: number) {
    this.transport.referenceMatchDb = Math.max(-24, Math.min(12, db));
    this.applyReferenceMonitoring();
    this.notify();
  }

  private applyReferenceMonitoring() {
    if (this.monitorOutGain) {
      this.monitorOutGain.gain.value = this.transport.referenceEnabled ? 0 : this.transport.monoPreviewOn ? 0 : 1;
    }
    if (this.referenceGain) {
      this.referenceGain.gain.value = this.transport.referenceEnabled
        ? DB_TO_LINEAR(this.transport.referenceMatchDb)
        : 0;
    }
  }

  private stopReferenceSource() {
    if (this.referenceSource) {
      try {
        this.referenceSource.stop();
      } catch {
        /* no-op */
      }
      this.referenceSource.disconnect();
      this.referenceSource = null;
    }
  }

  private syncReferenceSource() {
    if (!this.ctx || !this.referenceGain || !this.referenceBuffer || !this.transport.referenceEnabled) return;
    this.stopReferenceSource();
    const src = this.ctx.createBufferSource();
    src.buffer = this.referenceBuffer;
    src.loop = true;
    src.connect(this.referenceGain);
    const offset = this.referenceBuffer.duration > 0
      ? ((this.transport.positionSec % this.referenceBuffer.duration) + this.referenceBuffer.duration) % this.referenceBuffer.duration
      : 0;
    const when = this.transport.isPlaying ? this.ctx.currentTime + TRANSPORT_START_LEAD_SEC : this.ctx.currentTime;
    try {
      src.start(when, offset);
      this.referenceSource = src;
    } catch {
      this.referenceSource = null;
    }
  }

  /** Set one band of the master EQ in dB. Same shape as track EQ. */
  setMasterEq(band: EqBand, db: number) {
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

  /** Master EQ + gain A/B snapshots (#4). Producers store a "before"
   *  state in A, tweak, store the "after" in B, then toggle to hear the
   *  difference. Two slots is enough for most A/B work; more would
   *  start to feel like preset management. */
  private masterAbSlots: {
    A: { lowDb: number; midDb: number; highDb: number; masterDb: number } | null;
    B: { lowDb: number; midDb: number; highDb: number; masterDb: number } | null;
  } = { A: null, B: null };

  storeMasterAbSlot(slot: "A" | "B") {
    this.masterAbSlots[slot] = {
      lowDb: this.transport.masterEqLowDb,
      midDb: this.transport.masterEqMidDb,
      highDb: this.transport.masterEqHighDb,
      masterDb: this.transport.masterDb,
    };
    this.notify();
  }

  recallMasterAbSlot(slot: "A" | "B"): boolean {
    const snap = this.masterAbSlots[slot];
    if (!snap) return false;
    this.setMasterEq("low", snap.lowDb);
    this.setMasterEq("mid", snap.midDb);
    this.setMasterEq("high", snap.highDb);
    this.setMasterDb(snap.masterDb);
    return true;
  }

  hasMasterAbSlot(slot: "A" | "B"): boolean {
    return this.masterAbSlots[slot] !== null;
  }

  /** Apply a named mastering chain preset. Each preset is a frozen
   *  EQ + limiter + master-gain config tuned for a delivery target.
   *  Users hit one button and get a usable master without engineering
   *  knowledge. They can still tweak the EQ knobs afterward — the
   *  preset just sets the starting point. */
  applyMasteringPreset(preset: MasteringPresetId): MasteringPresetConfig {
    const config = MASTERING_PRESETS[preset];
    this.setMasterEq("low", config.eqLowDb);
    this.setMasterEq("mid", config.eqMidDb);
    this.setMasterEq("high", config.eqHighDb);
    this.setMasterLimiter(config.limiterOn);
    this.setMasterDb(config.masterDb);
    return config;
  }

  /** Freeze a track: pre-render its FX chain (EQ + comp + vocal bus +
   *  sends + gain + pan) into an AudioBuffer, swap the live buffer for
   *  the rendered output, and flatten the FX so playback doesn't
   *  double-process. Drops CPU dramatically on heavy tracks because the
   *  live FX chain is no longer running. Reversible via unfreezeTrack. */
  async freezeTrack(id: TrackId): Promise<boolean> {
    if (!this.ctx) return false;
    const t = this.tracks.get(id);
    if (!t || t.state.frozen || !t.buffer) return false;

    // Render the track's chain offline. We reuse buildOfflineChain so
    // every FX param matches what the user has dialed in live.
    const sourceBuffer = t.buffer;
    const tailSec = 1.0; // headroom for reverb/delay tails
    const totalSec = sourceBuffer.duration + tailSec;
    const sampleRate = this.ctx.sampleRate;
    const offline = new OfflineAudioContext(
      2,
      Math.ceil(totalSec * sampleRate),
      sampleRate,
    );

    const chain = this.buildOfflineChain(offline, t.state);

    // Build minimal aux returns (same shape as renderMix) so reverb/delay
    // sends are baked into the frozen buffer.
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
    offReverbIn.connect(offReverb).connect(offReverbReturn);

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
    offDelay.connect(offDelayReturn);

    // Sum chain output + aux returns into a frozen-output gain.
    const out = offline.createGain();
    chain.outNode.connect(out);
    chain.reverbSend.connect(offReverbIn);
    chain.delaySend.connect(offDelayIn);
    offReverbReturn.connect(out);
    offDelayReturn.connect(out);
    out.connect(offline.destination);

    const src = offline.createBufferSource();
    src.buffer = sourceBuffer;
    src.connect(chain.inNode);
    src.start(0);

    let renderedBuffer: AudioBuffer;
    try {
      renderedBuffer = await offline.startRendering();
    } catch {
      return false;
    }

    // Stash the originals so unfreeze can fully restore.
    t.preFreezeBuffer = sourceBuffer;
    t.preFreezeFx = { ...t.state.fx };
    t.preFreezeGainDb = t.state.gainDb;
    t.preFreezePan = t.state.pan;

    // Swap in the rendered buffer + flatten FX so the live chain is
    // effectively a passthrough on playback.
    t.buffer = renderedBuffer;
    t.state.durationSec = renderedBuffer.duration;
    t.state.frozen = true;
    t.state.fx = { ...DEFAULT_TRACK_FX };
    // gainDb + pan stay at unity — the freeze captured them already.
    t.state.gainDb = 0;
    t.state.pan = 0;

    // Push the flattened FX values into the live AudioNodes so the
    // running graph reflects the new (neutral) state immediately.
    if (t.eqLow) t.eqLow.gain.value = 0;
    if (t.eqMid) t.eqMid.gain.value = 0;
    if (t.eqHigh) t.eqHigh.gain.value = 0;
    if (t.compBypass && t.compMix) {
      t.compBypass.gain.value = 1;
      t.compMix.gain.value = 0;
    }
    if (t.reverbSendGain) t.reverbSendGain.gain.value = 0;
    if (t.delaySendGain) t.delaySendGain.gain.value = 0;
    if (t.gainNode) t.gainNode.gain.value = 1;
    if (t.panNode) t.panNode.pan.value = 0;
    // Vocal bus has 5 nodes (drive, saturator curve, presence, air,
    // dry/crush mix). applyVocalBusState walks all of them off the
    // current state.fx — which we just reset to DEFAULT_TRACK_FX
    // (vocalBusEnabled = false → all five nodes flatten to passthrough).
    // Earlier this only zeroed three nodes, leaving the saturator curve
    // and crush blend stale on the rendered playback.
    this.applyVocalBusState(t);

    this.notify();
    return true;
  }

  /** Restore a frozen track to its pre-freeze state. Drops the rendered
   *  buffer, restores the original recording, and rewires the FX values
   *  the user had before freezing. */
  unfreezeTrack(id: TrackId): boolean {
    const t = this.tracks.get(id);
    if (!t || !t.state.frozen || !t.preFreezeBuffer) return false;

    t.buffer = t.preFreezeBuffer;
    t.state.durationSec = t.preFreezeBuffer.duration;
    if (t.preFreezeFx) t.state.fx = { ...t.preFreezeFx };
    if (t.preFreezeGainDb !== null) t.state.gainDb = t.preFreezeGainDb;
    if (t.preFreezePan !== null) t.state.pan = t.preFreezePan;

    // Reapply FX values to the running graph.
    if (t.eqLow) t.eqLow.gain.value = t.state.fx.eqLowDb;
    if (t.eqMid) t.eqMid.gain.value = t.state.fx.eqMidDb;
    if (t.eqHigh) t.eqHigh.gain.value = t.state.fx.eqHighDb;
    if (t.compBypass && t.compMix) {
      t.compBypass.gain.value = t.state.fx.compEnabled ? 0 : 1;
      t.compMix.gain.value = t.state.fx.compEnabled ? 1 : 0;
    }
    if (t.reverbSendGain) t.reverbSendGain.gain.value = t.state.fx.reverbWet;
    if (t.delaySendGain) t.delaySendGain.gain.value = t.state.fx.delayWet;
    if (t.gainNode) t.gainNode.gain.value = DB_TO_LINEAR(t.state.gainDb);
    if (t.panNode) t.panNode.pan.value = t.state.pan;
    // Vocal bus chain — drive, saturator curve, presence, air, dry/crush
    // mix. applyVocalBusState handles all five nodes in one place and
    // ramps them so the unfreeze isn't a clicky step change.
    this.applyVocalBusState(t);

    t.preFreezeBuffer = null;
    t.preFreezeFx = null;
    t.preFreezeGainDb = null;
    t.preFreezePan = null;
    t.state.frozen = false;

    this.notify();
    return true;
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
      // EQ / comp / vocal bus / sends treatment as live monitoring.
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
    // The meter loop parks itself when nothing's playing — wake it so
    // levels start flowing again on this play() boundary.
    this.kickMeterLoop();
    if (this.transport.referenceEnabled) {
      this.syncReferenceSource();
    }
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
    this.stopReferenceSource();
    this.stopMetronome();
    this.stopBeatScheduler();
    this.stopMidiClipScheduler();
    this.beatMachine.activeStep = -1;
    // Reset the glide source so the first note after a stop starts on
    // its actual pitch instead of sliding from wherever we left off.
    this.lastSynthFreq = null;
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
    else {
      if (this.transport.referenceEnabled) this.syncReferenceSource();
      this.notify();
    }
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

  /** Heuristic chord detection over a track's audio. Returns the chord
   *  progression as a compact list (consecutive duplicates collapsed).
   *  Empty when the track has no audio. Pure synchronous compute on the
   *  main thread — runs in ~300ms for a 60s clip. */
  async detectTrackChords(trackId: TrackId): Promise<ChordHit[]> {
    const t = this.tracks.get(trackId);
    if (!t || !t.buffer) return [];
    const { detectChords, mixToMono } = await import("./chordDetect");
    const mono = mixToMono(t.buffer);
    return detectChords(mono, t.buffer.sampleRate, this.transport.bpm);
  }

  /** Convert an AudioBuffer (e.g. a freshly-captured mic recording) into
   *  a MIDI clip and write it to the engine. Used by the Voice → MIDI
   *  button (#4) so users can hum melodies into the synth track without
   *  having to play piano. */
  async convertBufferToMidi(
    buffer: AudioBuffer,
  ): Promise<{ clip: MidiClip; confidence: number } | null> {
    const { audioToMidiNotes } = await import("./voiceToMidi");
    const { mixToMono } = await import("./chordDetect");
    const mono = mixToMono(buffer);
    const { notes, lengthBeats, confidence } = audioToMidiNotes(
      mono,
      buffer.sampleRate,
      this.transport.bpm,
    );
    if (notes.length === 0) return null;
    const clip: MidiClip = {
      notes: notes.map((n) => ({
        note: n.note,
        startBeat: n.startBeat,
        durationBeats: n.durationBeats,
        velocity: n.velocity,
      })),
      lengthBeats,
    };
    this.midi = { ...this.midi, clip };
    if (this.transport.isPlaying) this.scheduleMidiClipTicks();
    this.notify();
    return { clip, confidence };
  }

  /** Convert a track's audio (typically a vocal take) into a MIDI clip
   *  using YIN-style pitch tracking. Replaces the engine's current MIDI
   *  clip — the user can then edit it in the piano roll. Best on solo,
   *  monophonic vocal lines; choirs and heavy reverb produce noisy
   *  output that's flagged as a known limitation. */
  async convertTrackToMidi(trackId: TrackId): Promise<MidiClip | null> {
    const t = this.tracks.get(trackId);
    if (!t || !t.buffer) return null;
    const { audioToMidiNotes } = await import("./voiceToMidi");
    const { mixToMono } = await import("./chordDetect");
    const mono = mixToMono(t.buffer);
    const { notes, lengthBeats } = audioToMidiNotes(
      mono,
      t.buffer.sampleRate,
      this.transport.bpm,
    );
    if (notes.length === 0) return null;
    const clip: MidiClip = {
      notes: notes.map((n) => ({
        note: n.note,
        startBeat: n.startBeat,
        durationBeats: n.durationBeats,
        velocity: n.velocity,
      })),
      lengthBeats,
    };
    this.midi = { ...this.midi, clip };
    if (this.transport.isPlaying) this.scheduleMidiClipTicks();
    this.notify();
    return clip;
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
    if (this.transport.isRecording || this.recordingStartInFlight || this.recordingStopInFlight) return false;

    const wasPlaying = this.transport.isPlaying;
    const track =
      (trackId ? this.tracks.get(trackId) : null) ??
      Array.from(this.tracks.values()).find((t) => t.state.armed);
    if (!track) return false;

    this.recordingStartInFlight = true;
    try {
      const okInput = await this.ensureTrackInputPipeline(track);
      if (!okInput) return false;

      if (!wasPlaying) {
        void this.play();
      }

      if (!wasPlaying && this.transport.countInEnabled) {
        await this.runCountIn();
      }

      track.activeTakeChunks = [];
      track.captureActive = true;
      track.recordedChunks = [];
      track.blob = null;

      // Seed with pre-roll when not punching, so the artist keeps the
      // "oops I started right before record" moment.
      if (!this.transport.punchInEnabled && this.transport.preRollSec > 0) {
        track.activeTakeChunks.push(...track.preRollChunks);
      }

      const canWebCodecs = this.canUseWebCodecsCapture();
      let usingWebCodecs = false;
      if (canWebCodecs) {
        usingWebCodecs = await this.startWebCodecsCapture(track);
      }
      this.transport.captureBackend = usingWebCodecs ? "webcodecs-opus" : "mediarecorder";
      track.captureBackend = this.transport.captureBackend;

      if (!usingWebCodecs) {
        if (typeof MediaRecorder === "undefined" || !track.liveStream) {
          track.captureActive = false;
          return false;
        }
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
        const recorder = new MediaRecorder(track.liveStream, {
          mimeType: mime,
          audioBitsPerSecond: 256_000,
        });
        track.recordedChunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) track.recordedChunks.push(e.data);
        };
        recorder.start(100);
        track.recorder = recorder;
      }

      if (usingWebCodecs && !this.transport.punchInEnabled && this.transport.preRollSec > 0) {
        for (const chunk of track.preRollChunks) {
          this.encodeWebCodecsChunk(track, chunk);
        }
      }

      this.transport.isRecording = true;
      // Recording always wants live meters even before play() — kick
      // the loop here so a "record without play" arm shows levels.
      this.kickMeterLoop();
      this.recordingAlignmentTrimSec = wasPlaying ? 0 : TRANSPORT_START_LEAD_SEC;
      this.notify();
      return true;
    } catch (err) {
      console.warn("[DawEngine] recording init failed", err);
      // Clean up any partial state.
      track.captureActive = false;
      this.teardownTrackInputPipeline(track);
      this.transport.isRecording = false;
      this.recordingAlignmentTrimSec = 0;
      this.notify();
      return false;
    } finally {
      this.recordingStartInFlight = false;
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.ctx) return;
    if (this.recordingStopInFlight) return;
    this.recordingStopInFlight = true;
    try {
    const recordingTrack = Array.from(this.tracks.values()).find(
      (t) => t.captureActive || t.recorder || t.webCodecEncoder,
    );
    if (!recordingTrack) {
      this.transport.isRecording = false;
      this.notify();
      return;
    }
    const ctx = this.ctx;

    // Stop MediaRecorder path and wait for final chunks.
    if (recordingTrack.recorder) {
      await new Promise<void>((resolve) => {
        const r = recordingTrack.recorder!;
        r.onstop = () => resolve();
        try {
          r.stop();
        } catch {
          resolve();
        }
      });
    }

    recordingTrack.captureActive = false;
    recordingTrack.recorder = null;

    let takeBuffer: AudioBuffer | null = null;
    if (recordingTrack.captureBackend === "webcodecs-opus") {
      takeBuffer = await this.stopWebCodecsCapture(recordingTrack);
    }
    if (recordingTrack.activeTakeChunks.length > 0) {
      takeBuffer =
        takeBuffer ?? this.bufferFromMonoPcm(recordingTrack.activeTakeChunks, ctx.sampleRate);
    }

    if (!takeBuffer && recordingTrack.recordedChunks.length > 0) {
      const blob = new Blob(recordingTrack.recordedChunks, { type: "audio/webm" });
      recordingTrack.blob = blob;
      try {
        const arrayBuf = await blob.arrayBuffer();
        takeBuffer = await ctx.decodeAudioData(arrayBuf);
      } catch (err) {
        console.warn("[DawEngine] decode failed", err);
      }
    }

    if (takeBuffer) {
      const onsetTrimSec =
        this.transport.vocalCaptureProfile === "raw"
          ? this.recordingAlignmentTrimSec
          : this.estimateOnsetTrimSec(takeBuffer, this.recordingAlignmentTrimSec);
      const aligned = this.trimBufferStart(takeBuffer, onsetTrimSec);
      let processed = this.normalizeRecordedBuffer(aligned);

      if (
        this.transport.punchInEnabled &&
        recordingTrack.buffer &&
        this.transport.punchOutSec > this.transport.punchInSec
      ) {
        processed = this.mergePunchTake(
          recordingTrack.buffer,
          processed,
          this.transport.punchInSec,
          this.transport.punchOutSec,
        );
      }

      if (this.transport.loopEnabled && this.transport.loopRecordEnabled) {
        this.appendCompLaneTake(recordingTrack, processed);
      }

      recordingTrack.buffer = processed;
      recordingTrack.state.hasAudio = true;
      this.waveformCache.delete(recordingTrack.state.id);
      recordingTrack.state.durationSec = recordingTrack.buffer.duration;
    }

    recordingTrack.activeTakeChunks = [];

    this.transport.isRecording = false;
    this.recordingAlignmentTrimSec = 0;
    if (this.transport.punchInEnabled || this.transport.loopRecordEnabled) {
      // Preserve playback for iterative fixes and loop takes.
      this.notify();
    } else {
      this.stop();
      this.transport.positionSec = 0;
    }
    this.transport.lastRecordedTrackId = recordingTrack.state.id;
    this.notify();
    } finally {
      this.recordingStopInFlight = false;
    }
  }

  private async runCountIn(): Promise<void> {
    if (!this.ctx) return;
    const beats = Math.max(0, this.transport.countInBars * 4);
    this.transport.countInRemainingBeats = beats;
    this.notify();
    const beatMs = (60 / this.transport.bpm) * 1000;
    for (let i = beats; i > 0; i--) {
      this.transport.countInRemainingBeats = i;
      this.notify();
      await new Promise<void>((resolve) => window.setTimeout(resolve, beatMs));
    }
    this.transport.countInRemainingBeats = 0;
  }

  private bufferFromMonoPcm(chunks: Float32Array[], sampleRate: number): AudioBuffer {
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const out = this.ctx!.createBuffer(1, Math.max(1, total), sampleRate);
    const data = out.getChannelData(0);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  private mergePunchTake(
    original: AudioBuffer,
    take: AudioBuffer,
    punchInSec: number,
    punchOutSec: number,
  ): AudioBuffer {
    if (!this.ctx) return take;
    const sampleRate = original.sampleRate;
    const outLen = Math.max(original.length, Math.floor(punchOutSec * sampleRate), take.length);
    const out = this.ctx.createBuffer(original.numberOfChannels, outLen, sampleRate);
    const inFrame = Math.max(0, Math.floor(punchInSec * sampleRate));
    const outFrame = Math.max(inFrame + 1, Math.floor(punchOutSec * sampleRate));
    const fadeFrames = Math.max(1, Math.floor(sampleRate * 0.01));

    for (let ch = 0; ch < out.numberOfChannels; ch++) {
      const dst = out.getChannelData(ch);
      const orig = original.getChannelData(Math.min(ch, original.numberOfChannels - 1));
      const takeData = take.getChannelData(Math.min(ch, take.numberOfChannels - 1));
      for (let i = 0; i < dst.length; i++) {
        const o = orig[i] ?? 0;
        let v = o;
        if (i >= inFrame && i < outFrame) {
          const ti = i - inFrame;
          const tv = takeData[Math.min(takeData.length - 1, Math.max(0, ti))] ?? 0;
          if (i < inFrame + fadeFrames) {
            const k = (i - inFrame) / fadeFrames;
            v = o * (1 - k) + tv * k;
          } else if (i > outFrame - fadeFrames) {
            const k = (outFrame - i) / fadeFrames;
            v = o * (1 - k) + tv * k;
          } else {
            v = tv;
          }
        }
        dst[i] = v;
      }
    }
    return out;
  }

  private appendCompLaneTake(track: TrackInternal, take: AudioBuffer) {
    const id = `lane_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const createdAt = new Date().toISOString();
    const name = `Take ${track.compLaneBuffers.length + 1}`;
    track.compLaneBuffers.push({ id, name, buffer: take, createdAt });
    while (track.compLaneBuffers.length > this.transport.maxLoopTakes) {
      track.compLaneBuffers.shift();
    }
    track.state.compLanes = track.compLaneBuffers.map((lane) => ({
      id: lane.id,
      name: lane.name,
      durationSec: lane.buffer.duration,
      createdAt: lane.createdAt,
      selected: lane.id === id,
    }));
    if (track.compSegmentLaneIds.length === 0) {
      track.compSegmentLaneIds = Array.from({ length: COMP_SEGMENT_COUNT }, () => id);
    } else {
      for (let i = 0; i < COMP_SEGMENT_COUNT; i++) {
        if (!track.compSegmentLaneIds[i]) {
          track.compSegmentLaneIds[i] = id;
        }
      }
    }
    track.state.compSegmentLaneIds = [...track.compSegmentLaneIds];
  }

  setTrackCompLane(trackId: TrackId, laneId: string) {
    const track = this.tracks.get(trackId);
    if (!track) return;
    const lane = track.compLaneBuffers.find((l) => l.id === laneId);
    if (!lane) return;
    track.buffer = lane.buffer;
    track.state.durationSec = lane.buffer.duration;
    track.state.hasAudio = true;
    track.state.compLanes = track.compLaneBuffers.map((entry) => ({
      id: entry.id,
      name: entry.name,
      durationSec: entry.buffer.duration,
      createdAt: entry.createdAt,
      selected: entry.id === laneId,
    }));
    track.compSegmentLaneIds = Array.from({ length: COMP_SEGMENT_COUNT }, () => laneId);
    track.state.compSegmentLaneIds = [...track.compSegmentLaneIds];
    this.waveformCache.delete(trackId);
    this.notify();
  }

  /** Bulk version of setTrackCompSegmentLane for the drag-select comp
   *  UI — assigns [start..end] inclusive to a lane in one notify, so
   *  the user sees a single rebuilt buffer instead of N intermediate
   *  rebuilds. */
  setTrackCompSegmentRange(
    trackId: TrackId,
    startIdx: number,
    endIdx: number,
    laneId: string,
  ) {
    const track = this.tracks.get(trackId);
    if (!track) return;
    const lane = track.compLaneBuffers.find((entry) => entry.id === laneId);
    if (!lane) return;
    const lo = Math.max(0, Math.min(COMP_SEGMENT_COUNT - 1, startIdx));
    const hi = Math.max(0, Math.min(COMP_SEGMENT_COUNT - 1, endIdx));
    if (track.compSegmentLaneIds.length !== COMP_SEGMENT_COUNT) {
      const fallback = laneId;
      track.compSegmentLaneIds = Array.from(
        { length: COMP_SEGMENT_COUNT },
        (_, i) => track.compSegmentLaneIds[i] || fallback,
      );
    }
    for (let i = lo; i <= hi; i++) {
      track.compSegmentLaneIds[i] = laneId;
    }
    const composed = this.buildCompFromSegments(track);
    if (!composed) return;
    track.buffer = composed;
    track.state.durationSec = composed.duration;
    track.state.hasAudio = true;
    track.state.compSegmentLaneIds = [...track.compSegmentLaneIds];
    const firstLane = track.compSegmentLaneIds[0] ?? null;
    const allSame = firstLane
      ? track.compSegmentLaneIds.every((id) => id === firstLane)
      : false;
    track.state.compLanes = track.compLaneBuffers.map((entry) => ({
      id: entry.id,
      name: entry.name,
      durationSec: entry.buffer.duration,
      createdAt: entry.createdAt,
      selected: allSame ? entry.id === firstLane : false,
    }));
    this.waveformCache.delete(trackId);
    this.notify();
  }

  /** Rename a take/lane. Useful for "Take 2 - softer" etc. so the comp
   *  brush + waveform strip read like a human notebook, not "lane_3". */
  renameCompLane(trackId: TrackId, laneId: string, name: string) {
    const track = this.tracks.get(trackId);
    if (!track) return;
    const lane = track.compLaneBuffers.find((entry) => entry.id === laneId);
    if (!lane) return;
    lane.name = name.slice(0, 32);
    track.state.compLanes = track.compLaneBuffers.map((entry) => ({
      id: entry.id,
      name: entry.name,
      durationSec: entry.buffer.duration,
      createdAt: entry.createdAt,
      selected: entry.id === laneId ? entry.id === laneId : entry.id === (track.state.compLanes.find((l) => l.selected)?.id ?? entry.id),
    }));
    this.notify();
  }

  setTrackCompSegmentLane(trackId: TrackId, segmentIndex: number, laneId: string) {
    const track = this.tracks.get(trackId);
    if (!track) return;
    const lane = track.compLaneBuffers.find((entry) => entry.id === laneId);
    if (!lane) return;
    if (segmentIndex < 0 || segmentIndex >= COMP_SEGMENT_COUNT) return;

    if (track.compSegmentLaneIds.length !== COMP_SEGMENT_COUNT) {
      const fallback = laneId;
      track.compSegmentLaneIds = Array.from({ length: COMP_SEGMENT_COUNT }, (_, i) =>
        track.compSegmentLaneIds[i] || fallback,
      );
    }
    track.compSegmentLaneIds[segmentIndex] = laneId;

    const composed = this.buildCompFromSegments(track);
    if (!composed) return;

    track.buffer = composed;
    track.state.durationSec = composed.duration;
    track.state.hasAudio = true;
    track.state.compSegmentLaneIds = [...track.compSegmentLaneIds];

    const firstLane = track.compSegmentLaneIds[0] ?? null;
    const allSame = firstLane
      ? track.compSegmentLaneIds.every((id) => id === firstLane)
      : false;
    track.state.compLanes = track.compLaneBuffers.map((entry) => ({
      id: entry.id,
      name: entry.name,
      durationSec: entry.buffer.duration,
      createdAt: entry.createdAt,
      selected: allSame ? entry.id === firstLane : false,
    }));

    this.waveformCache.delete(trackId);
    this.notify();
  }

  private buildCompFromSegments(track: TrackInternal): AudioBuffer | null {
    if (!this.ctx || track.compLaneBuffers.length === 0) return null;
    const maxLen = track.compLaneBuffers.reduce((len, lane) => Math.max(len, lane.buffer.length), 0);
    if (maxLen <= 0) return null;
    const sampleRate = track.compLaneBuffers[0]?.buffer.sampleRate ?? this.ctx.sampleRate;
    const out = this.ctx.createBuffer(1, maxLen, sampleRate);
    const dst = out.getChannelData(0);
    const segFrames = Math.floor(maxLen / COMP_SEGMENT_COUNT);

    for (let seg = 0; seg < COMP_SEGMENT_COUNT; seg++) {
      const start = seg * segFrames;
      const end = seg === COMP_SEGMENT_COUNT - 1 ? maxLen : (seg + 1) * segFrames;
      const laneId = track.compSegmentLaneIds[seg] ?? track.compLaneBuffers[0]?.id;
      const lane = track.compLaneBuffers.find((entry) => entry.id === laneId) ?? track.compLaneBuffers[0];
      if (!lane) continue;
      const src = lane.buffer.getChannelData(0);
      for (let i = start; i < end; i++) {
        dst[i] = src[Math.min(src.length - 1, i)] ?? 0;
      }
      const fade = Math.min(96, Math.max(8, Math.floor(sampleRate * 0.002)));
      if (seg > 0) {
        for (let f = 0; f < fade && start + f < end; f++) {
          const k = f / fade;
          const idx = start + f;
          const prev = dst[idx] ?? 0;
          const cur = src[Math.min(src.length - 1, idx)] ?? 0;
          dst[idx] = prev * (1 - k) + cur * k;
        }
      }
    }

    return out;
  }

  /** Trim N seconds from the front of a buffer, preserving channel count/rate. */

  /** Permanently discard the audio on a track (saved in previousBuffer for undo). */
  deleteTrackAudio(id: TrackId): boolean {
    const t = this.tracks.get(id);
    if (!t || !t.buffer) return false;
    t.previousBuffer = t.buffer;
    t.buffer = null;
    t.blob = null;
    t.recordedChunks = [];
    t.state.hasAudio = false;
    t.state.durationSec = 0;
    this.waveformCache.delete(id);
    this.transport.lastRecordedTrackId = null;
    this.notify();
    return true;
  }

  /** Restore the most recently deleted audio on a track. */
  undoDeleteTrackAudio(id: TrackId): boolean {
    const t = this.tracks.get(id);
    if (!t || !t.previousBuffer) return false;
    t.buffer = t.previousBuffer;
    t.previousBuffer = null;
    t.state.hasAudio = true;
    t.state.durationSec = t.buffer.duration;
    this.waveformCache.delete(id);
    this.notify();
    return true;
  }

  /**
   * Immediately play back the recorded audio on a track through its strip FX,
   * independent of transport state (useful for quick "hear-back" after recording).
   */
  previewTake(id: TrackId): void {
    if (!this.ctx) return;
    const t = this.tracks.get(id);
    if (!t?.buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = t.buffer;
    src.connect(t.fxIn);
    src.start(0);
  }

  /** Enable/disable punch-in recording and set the time window. */
  setPunchIn(enabled: boolean, startSec?: number, endSec?: number): void {
    this.transport.punchInEnabled = enabled;
    if (startSec !== undefined)
      this.transport.punchInSec = Math.max(0, startSec);
    if (endSec !== undefined)
      this.transport.punchOutSec = Math.max(this.transport.punchInSec + 0.5, endSec);
    this.notify();
  }

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
      gateThreshold = 0;
      gateAmount = 1;
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
    // Beat-on creates audio output → wake the meter loop. Beat-off
    // doesn't need to stop it (needsMeterTick will park it on the next
    // frame if nothing else needs it).
    if (enabled) this.kickMeterLoop();
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
    this.beatMachine.bankStepOptions[this.beatMachine.activeBank] = this.beatMachine.stepOptions;
    this.beatMachine.activeBank = bank;
    this.beatMachine.pattern = this.beatMachine.bankPatterns[bank];
    this.beatMachine.stepOptions = this.beatMachine.bankStepOptions[bank] ?? {};
    this.beatMachine.queuedBank = null;
    this.notify();
  }

  /** Deep-clone the current active pattern (and its step options) into
   *  another bank slot. Producers nail a verse beat in A and want it as
   *  a starting point for the chorus in B without rebuilding from
   *  scratch. The destination overwrites without confirmation — the
   *  undo stack covers accidental copies. */
  copyActivePatternToBank(target: PatternBank) {
    if (target === this.beatMachine.activeBank) return;
    const src = this.beatMachine.pattern;
    const dest = emptyPattern();
    for (const lane of DRUM_LANES) dest[lane] = [...src[lane]];
    this.beatMachine.bankPatterns[target] = dest;
    // Also clone step options so velocity/probability/repeats carry
    // over — the user's nuance shouldn't reset on copy.
    this.beatMachine.bankStepOptions[target] = cloneStepOptions(
      this.beatMachine.stepOptions,
    );
    this.notify();
  }

  /** Queue a bank switch for the next loop boundary instead of jumping
   *  mid-bar. When fillsEnabled is true, the scheduler also paints the
   *  configured fillPreset over the last bar before the switch. */
  setQueuedBank(bank: PatternBank | null) {
    this.beatMachine.queuedBank = bank;
    this.notify();
  }

  setBeatKit(kit: DrumKitId) {
    this.beatMachine.kit = kit;
    this.refreshBeatLaneFrequencyProfiles();
    this.notify();
  }

  /** Optional secondary kit per lane. Pass null to clear. Renders to the
   *  same beat track in the same scheduling pass, so two kits stack on
   *  the same step without latency drift. */
  setBeatLayerKit(lane: DrumKind, kit: DrumKitId | null) {
    if (kit === null) {
      delete this.beatMachine.layerKitB[lane];
    } else {
      this.beatMachine.layerKitB[lane] = kit;
    }
    this.notify();
  }

  /** Per-lane pitch offset (-12..+12 semitones). 0 clears. Affects both
   *  the kit synth detune and the loaded sample's playbackRate. */
  setBeatLaneSemis(lane: DrumKind, semis: number) {
    const clamped = Math.max(-12, Math.min(12, semis));
    if (clamped === 0) {
      delete this.beatMachine.laneSemis[lane];
    } else {
      this.beatMachine.laneSemis[lane] = clamped;
    }
    this.notify();
  }

  /** Per-lane sample reverse toggle. Synth-only lanes ignore it
   *  silently. The reversed AudioBuffer is built lazily and cached. */
  setBeatLaneReversed(lane: DrumKind, reversed: boolean) {
    if (reversed) {
      this.beatMachine.laneReversed[lane] = true;
    } else {
      delete this.beatMachine.laneReversed[lane];
    }
    this.notify();
  }

  /** Per-lane display name override. Empty string clears the override
   *  and the lane falls back to the canonical label. */
  setBeatLaneName(lane: DrumKind, name: string) {
    const trimmed = name.trim().slice(0, 12);
    if (trimmed === "") {
      delete this.beatMachine.laneNames[lane];
    } else {
      this.beatMachine.laneNames[lane] = trimmed;
    }
    this.notify();
  }

  /** Per-lane resonator amount (#19). 0 clears. >0 layers a pitched
   *  sine tail on each hit through scheduleResonatorTail. */
  setBeatLaneResonator(lane: DrumKind, amount: number) {
    const clamped = Math.max(0, Math.min(1, amount));
    if (clamped === 0) {
      delete this.beatMachine.laneResonator[lane];
    } else {
      this.beatMachine.laneResonator[lane] = clamped;
    }
    this.notify();
  }

  /** Lazy-build and cache a reversed copy of an AudioBuffer. The cache
   *  is a WeakMap keyed by source buffer, so swapping a lane's primary
   *  sample drops the reversed copy automatically (no manual cleanup). */
  private getOrBuildReversedBuffer(src: AudioBuffer): AudioBuffer {
    const cached = this.reversedBufferCache.get(src);
    if (cached) return cached;
    if (!this.ctx) return src;
    const out = this.ctx.createBuffer(
      src.numberOfChannels,
      src.length,
      src.sampleRate,
    );
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      const inData = src.getChannelData(ch);
      const outData = out.getChannelData(ch);
      const len = inData.length;
      for (let i = 0; i < len; i++) {
        outData[i] = inData[len - 1 - i] ?? 0;
      }
    }
    this.reversedBufferCache.set(src, out);
    return out;
  }

  /** Set a per-step modifier (velocity, probability, microShift, repeats).
   *  Pass `null` for the options to clear the step's overrides entirely. */
  setStepOptions(lane: DrumKind, step: number, opts: BeatStepOptions | null) {
    const map = this.beatMachine.stepOptions[lane] ?? {};
    if (opts === null) {
      delete map[step];
    } else {
      // Drop fields equal to defaults so the map stays sparse.
      const merged: BeatStepOptions = { ...(map[step] ?? {}), ...opts };
      if (merged.velocity === 1) delete merged.velocity;
      if (merged.probability === 1) delete merged.probability;
      if (merged.microShiftMs === 0) delete merged.microShiftMs;
      if (merged.repeats === 0) delete merged.repeats;
      if (Object.keys(merged).length === 0) {
        delete map[step];
      } else {
        map[step] = merged;
      }
    }
    this.beatMachine.stepOptions[lane] = map;
    this.beatMachine.bankStepOptions[this.beatMachine.activeBank] =
      this.beatMachine.stepOptions;
    this.notify();
  }

  setBeatSwing(swing: number) {
    this.beatMachine.swing = Math.max(0, Math.min(0.66, swing));
    this.notify();
  }

  setBeatHumanize(humanizeMs: number) {
    this.beatMachine.humanizeMs = Math.max(0, Math.min(15, humanizeMs));
    this.notify();
  }

  /** Live-performance stutter. 0 = off. 1..4 subdivide each bar by 4/8/
   *  16/32 — every step fires the current step's hits at that rate
   *  instead of advancing. Releasing returns to the pattern. */
  setBeatStutter(divisor: number) {
    this.beatMachine.stutter = Math.max(0, Math.min(4, Math.floor(divisor)));
    this.notify();
  }

  setBeatFillsEnabled(on: boolean) {
    this.beatMachine.fillsEnabled = on;
    this.notify();
  }

  setBeatFillPreset(preset: BeatFillPreset) {
    this.beatMachine.fillPreset = preset;
    this.notify();
  }

  setBeatLaneEq(lane: DrumKind, params: Partial<BeatLaneEqSetting>) {
    const prev = this.beatMachine.laneEqSettings[lane] ?? { hpHz: null, lpHz: null };
    const next: BeatLaneEqSetting = {
      hpHz:
        params.hpHz === undefined
          ? prev.hpHz
          : params.hpHz === null
            ? null
            : Math.max(20, Math.min(12000, params.hpHz)),
      lpHz:
        params.lpHz === undefined
          ? prev.lpHz
          : params.lpHz === null
            ? null
            : Math.max(20, Math.min(20000, params.lpHz)),
    };
    this.beatMachine.laneEqSettings[lane] = next;
    this.refreshBeatLaneFrequencyProfiles();
    this.notify();
  }

  applyBeatAntiOverlapPreset(preset: "kick808-split" | "percussion-lowcut") {
    if (preset === "kick808-split") {
      this.setBeatLaneEq("kick", { hpHz: 34, lpHz: 150 });
      this.setBeatLaneEq("bass808", { hpHz: 24, lpHz: 95 });
      return;
    }
    this.setBeatLaneEq("snare", { hpHz: 170, lpHz: null });
    this.setBeatLaneEq("clap", { hpHz: 320, lpHz: null });
    this.setBeatLaneEq("perc", { hpHz: 220, lpHz: null });
    this.setBeatLaneEq("hat", { hpHz: 4200, lpHz: null });
    this.setBeatLaneEq("openHat", { hpHz: 3600, lpHz: null });
    this.setBeatLaneEq("crash", { hpHz: 2200, lpHz: null });
  }

  clearBeatLaneEqTemplates() {
    this.beatMachine.laneEqSettings = emptyBeatLaneEqSettings();
    this.refreshBeatLaneFrequencyProfiles();
    this.notify();
  }

  /**
   * Build lane EQ recommendations from pattern density + timing overlap
   * + lane frequency profiles. Recommendations are advisory and are not
   * auto-applied.
   */
  analyzeBeatPatternConflicts(): LaneEqRecommendation[] {
    const pattern = this.beatMachine.pattern;
    const profiles = this.beatMachine.laneFrequencyProfiles;
    const laneEq = this.beatMachine.laneEqSettings;
    const recommendations: LaneEqRecommendation[] = [];

    const laneDensity = DRUM_LANES.reduce((acc, lane) => {
      acc[lane] = pattern[lane].reduce((sum, stepOn) => sum + (stepOn ? 1 : 0), 0);
      return acc;
    }, {} as Record<DrumKind, number>);

    const kick = pattern.kick;
    const bass = pattern.bass808;
    let kick808Overlap = 0;
    for (let i = 0; i < STEPS; i++) {
      const prev = (i - 1 + STEPS) % STEPS;
      const next = (i + 1) % STEPS;
      if (!kick[i]) continue;
      if (bass[i] || bass[prev] || bass[next]) kick808Overlap += 1;
    }

    const lowHeavyLanes = DRUM_LANES.filter(
      (lane) => profiles[lane].lowBandRatio >= 0.35 && profiles[lane].dominantHz <= 240,
    );

    if (kick808Overlap >= 2) {
      const targetKickHp = 36;
      if ((laneEq.kick.hpHz ?? 0) < targetKickHp) {
        recommendations.push({
          lane: "kick",
          type: "hp",
          valueHz: targetKickHp,
          confidence: 0.9,
          reason: `Kick and 808 overlap on ${kick808Overlap} step${kick808Overlap === 1 ? "" : "s"}; raise kick HP to open sub headroom.`,
        });
      }
      const target808Lp = 105;
      if (!laneEq.bass808.lpHz || laneEq.bass808.lpHz > target808Lp) {
        recommendations.push({
          lane: "bass808",
          type: "lp",
          valueHz: target808Lp,
          confidence: 0.86,
          reason: "808 top harmonics are masking kick attack; lower 808 LP for separation.",
        });
      }
    }

    if (lowHeavyLanes.length >= 3) {
      for (const lane of lowHeavyLanes) {
        if (lane === "kick" || lane === "bass808") continue;
        if (laneDensity[lane] < 2) continue;
        const currentHp = laneEq[lane].hpHz ?? 0;
        const suggestedHp = lane === "snare" ? 180 : lane === "clap" ? 300 : 220;
        if (currentHp < suggestedHp) {
          recommendations.push({
            lane,
            type: "hp",
            valueHz: suggestedHp,
            confidence: 0.72,
            reason: `${lane.toUpperCase()} is adding low-end during dense pattern sections; HP tightens overlap with kick/808.`,
          });
        }
      }
    }

    for (const lane of ["hat", "openHat", "crash"] as const) {
      if (laneDensity[lane] < 4) continue;
      const profile = profiles[lane];
      if (profile.lowBandRatio < 0.12) continue;
      const targetHp = lane === "hat" ? 4500 : lane === "openHat" ? 3600 : 2200;
      if ((laneEq[lane].hpHz ?? 0) < targetHp) {
        recommendations.push({
          lane,
          type: "hp",
          valueHz: targetHp,
          confidence: 0.64,
          reason: `${lane.toUpperCase()} lane has unexpected low-band energy; stronger HP will clear mud and mono blur.`,
        });
      }
    }

    const kickCenter = profiles.kick.dominantHz;
    const bassCenter = profiles.bass808.dominantHz;
    const centerGap = Math.abs(kickCenter - bassCenter);
    if (centerGap < 14 && laneDensity.kick > 0 && laneDensity.bass808 > 0) {
      recommendations.push({
        lane: "bass808",
        type: "retune",
        valueHz: Math.max(40, Math.round(bassCenter - 18)),
        confidence: 0.58,
        reason: `Kick/808 centers are only ${Math.round(centerGap)} Hz apart; retune 808 lower for cleaner punch-sub split.`,
      });
    }

    return recommendations
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8);
  }

  async setBeatLaneSample(lane: DrumKind, file: File): Promise<boolean> {
    if (!this.init() || !this.ctx) return false;
    try {
      const data = await file.arrayBuffer();
      const decoded = await this.ctx.decodeAudioData(data.slice(0));
      const buffer = this.prepareBeatLaneSample(decoded);
      this.beatLaneSamples[lane] = buffer;
      this.beatMachine.laneSampleNames[lane] = file.name;
      this.refreshBeatLaneFrequencyProfiles();
      this.notify();
      return true;
    } catch (err) {
      console.warn("[DawEngine] beat lane sample decode failed", { lane, file: file.name, err });
      return false;
    }
  }

  clearBeatLaneSample(lane: DrumKind) {
    this.beatLaneSamples[lane] = null;
    this.beatMachine.laneSampleNames[lane] = null;
    this.beatLaneVariants[lane] = [];
    this.beatMachine.laneVariantNames[lane] = [];
    this.beatLaneVariantCursor[lane] = 0;
    this.refreshBeatLaneFrequencyProfiles();
    this.notify();
  }

  /** Add a round-robin variant sample to a lane. The lane keeps the
   *  primary in beatLaneSamples and cycles through up to 3 alternates
   *  on consecutive triggers — sounds far more natural than the same
   *  hit firing identically every loop. Caps at 3 variants. */
  async addBeatLaneVariant(lane: DrumKind, file: File): Promise<boolean> {
    if (!this.init() || !this.ctx) return false;
    if (this.beatLaneVariants[lane].length >= 3) return false;
    try {
      const data = await file.arrayBuffer();
      const decoded = await this.ctx.decodeAudioData(data.slice(0));
      const buffer = this.prepareBeatLaneSample(decoded);
      this.beatLaneVariants[lane].push(buffer);
      this.beatMachine.laneVariantNames[lane].push(file.name);
      this.notify();
      return true;
    } catch (err) {
      console.warn("[DawEngine] beat lane variant decode failed", {
        lane,
        file: file.name,
        err,
      });
      return false;
    }
  }

  clearBeatLaneVariants(lane: DrumKind) {
    this.beatLaneVariants[lane] = [];
    this.beatMachine.laneVariantNames[lane] = [];
    this.beatLaneVariantCursor[lane] = 0;
    this.notify();
  }

  private estimateOversampledTruePeak(data: Float32Array): number {
    if (!data.length) return 0;
    let peak = 0;
    for (let i = 0; i < data.length - 1; i++) {
      const a = data[i] ?? 0;
      const b = data[i + 1] ?? 0;
      const aAbs = Math.abs(a);
      if (aAbs > peak) peak = aAbs;
      // 4x linear interpolation catches common inter-sample overs.
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        const sample = a + (b - a) * t;
        const abs = Math.abs(sample);
        if (abs > peak) peak = abs;
      }
    }
    const tail = Math.abs(data[data.length - 1] ?? 0);
    return tail > peak ? tail : peak;
  }

  private analyzeBeatLaneSample(lane: DrumKind, buffer: AudioBuffer): LaneFrequencyProfile {
    const frames = Math.min(buffer.length, 4096);
    if (frames < 16) {
      return buildLaneProfile(
        lane,
        "sample",
        SYNTH_LANE_CENTERS_HZ[lane],
        SYNTH_LANE_LOW_RATIO[lane],
      );
    }
    const mono = new Float32Array(frames);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      for (let i = 0; i < frames; i++) {
        mono[i] += (src[i] ?? 0) / buffer.numberOfChannels;
      }
    }

    const freqBins = [
      32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000,
      1600, 2500, 4000, 6300, 10000,
    ];
    const energyByBin = new Array(freqBins.length).fill(0);
    for (let bi = 0; bi < freqBins.length; bi++) {
      const freq = freqBins[bi];
      const omega = (2 * Math.PI * freq) / buffer.sampleRate;
      let re = 0;
      let im = 0;
      for (let i = 0; i < frames; i++) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, frames - 1));
        const v = (mono[i] ?? 0) * w;
        re += v * Math.cos(omega * i);
        im -= v * Math.sin(omega * i);
      }
      energyByBin[bi] = re * re + im * im;
    }

    let dominantIndex = 0;
    let dominantEnergy = -1;
    let totalEnergy = 0;
    let lowEnergy = 0;
    for (let i = 0; i < energyByBin.length; i++) {
      const e = energyByBin[i] ?? 0;
      totalEnergy += e;
      if ((freqBins[i] ?? 0) <= 180) lowEnergy += e;
      if (e > dominantEnergy) {
        dominantEnergy = e;
        dominantIndex = i;
      }
    }

    const dominantHz = freqBins[dominantIndex] ?? SYNTH_LANE_CENTERS_HZ[lane];
    const lowBandRatio = totalEnergy > 1e-9 ? lowEnergy / totalEnergy : SYNTH_LANE_LOW_RATIO[lane];
    return buildLaneProfile(lane, "sample", dominantHz, lowBandRatio);
  }

  private applyLaneEqInfluence(
    lane: DrumKind,
    baseProfile: LaneFrequencyProfile,
    eq: BeatLaneEqSetting,
  ): LaneFrequencyProfile {
    let dominant = baseProfile.dominantHz;
    let lowRatio = baseProfile.lowBandRatio;
    if (eq.hpHz && eq.hpHz > 0) {
      const hp = eq.hpHz;
      lowRatio *= hp >= 350 ? 0.2 : hp >= 200 ? 0.42 : hp >= 120 ? 0.62 : 0.8;
      dominant = Math.max(dominant, hp * 0.9);
    }
    if (eq.lpHz && eq.lpHz > 0) {
      const lp = eq.lpHz;
      if (lp < 130) lowRatio = Math.min(1, lowRatio + 0.08);
      dominant = Math.min(dominant, lp * 0.95);
    }
    return buildLaneProfile(lane, baseProfile.source, dominant, lowRatio);
  }

  private refreshBeatLaneFrequencyProfiles() {
    for (const lane of DRUM_LANES) {
      const sample = this.beatLaneSamples[lane];
      const eq = this.beatMachine.laneEqSettings[lane] ?? { hpHz: null, lpHz: null };
      const baseProfile = sample
        ? this.analyzeBeatLaneSample(lane, sample)
        : buildLaneProfile(
            lane,
            "synth",
            SYNTH_LANE_CENTERS_HZ[lane],
            SYNTH_LANE_LOW_RATIO[lane],
          );
      this.beatMachine.laneFrequencyProfiles[lane] = this.applyLaneEqInfluence(
        lane,
        baseProfile,
        eq,
      );
    }
  }

  /**
   * Sampler cleanup pass for producer one-shots:
   * - trims leading/trailing silence
   * - removes DC offset
   * - peak normalizes to leave a small headroom margin
   * - applies tiny fades to avoid click edges
   */
  private prepareBeatLaneSample(buffer: AudioBuffer): AudioBuffer {
    if (!this.ctx || buffer.length === 0) return buffer;

    const trim = findSampleTrimRange(buffer, 0.0035);
    const start = Math.max(0, trim.start);
    const end = Math.max(start, trim.end);
    const length = Math.max(1, end - start + 1);
    const out = this.ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);

    let peak = 0;
    const channelData: Float32Array[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = out.getChannelData(ch);
      channelData.push(dst);
      let mean = 0;
      for (let i = 0; i < length; i++) mean += src[start + i] ?? 0;
      mean /= length;
      for (let i = 0; i < length; i++) {
        const value = (src[start + i] ?? 0) - mean;
        dst[i] = value;
        const abs = Math.abs(value);
        if (abs > peak) peak = abs;
      }
    }

    const targetPeak = 0.92;
    const scale = peak > 0 ? Math.min(6, targetPeak / peak) : 1;
    const fadeSamples = Math.min(Math.floor(out.sampleRate * 0.003), Math.floor(length / 2));

    for (const dst of channelData) {
      for (let i = 0; i < length; i++) {
        let value = dst[i] * scale;
        if (fadeSamples > 0 && i < fadeSamples) {
          value *= i / fadeSamples;
        }
        if (fadeSamples > 0 && i >= length - fadeSamples) {
          value *= (length - i) / fadeSamples;
        }
        dst[i] = Math.max(-1, Math.min(1, value));
      }
    }

    return out;
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
      // Check enable state BEFORE doing any work or scheduling the next
      // tick. Earlier the timeout was scheduled unconditionally at the
      // end of every fire(), so disabling the beat machine mid-bar left
      // up to one stale wakeup in flight. We now also clear beatTimerId
      // on the way out so stopBeatScheduler can see "already parked"
      // and skip the redundant clearTimeout.
      if (!this.beatMachine.enabled || !this.transport.isPlaying) {
        this.beatTimerId = null;
        return;
      }
      while (this.beatNextTime < ctx.currentTime + 0.2) {
        const stepIndex = this.beatNextStep % STEPS;
        // Handle queued bank switch at loop boundary (step 0 of new loop).
        if (stepIndex === 0 && this.beatNextStep > 0 && this.beatMachine.queuedBank) {
          this.setActivePatternBank(this.beatMachine.queuedBank);
        }
        // Pick which pattern row to actually play this step. When fills
        // are enabled and we're on the last bar before a queued bank
        // switch, paint the fill preset over the underlying pattern.
        const onLastBarBeforeSwitch =
          this.beatMachine.fillsEnabled &&
          this.beatMachine.queuedBank !== null &&
          this.beatMachine.queuedBank !== this.beatMachine.activeBank;
        const sourcePattern: BeatPattern = onLastBarBeforeSwitch
          ? fillPattern(this.beatMachine.fillPreset)
          : this.beatMachine.pattern;
        this.fireStep(ctx, beatTrack.fxIn, sourcePattern, stepIndex, this.beatNextTime);
        this.beatMachine.activeStep = stepIndex;
        // Apply swing on every 2nd 16th — shift forward by
        // swing * stepDur * 0.5 (a swing of 0.5 places the off-step exactly
        // at the triplet). Stutter overrides normal step advance.
        const baseStep = stepSec();
        const isOffStep = stepIndex % 2 === 1;
        const swingShift = isOffStep ? baseStep * this.beatMachine.swing * 0.5 : 0;
        // When the next step (step+1) is the off-step, the *current* step
        // gets shortened so the swing sums to a full beat across the pair.
        const nextIsOffStep = (stepIndex + 1) % 2 === 1;
        const advance = nextIsOffStep
          ? baseStep + baseStep * this.beatMachine.swing * 0.5
          : baseStep - swingShift;
        // Stutter: subdivide the bar by 1/4..1/32. Each "step" advance is
        // a smaller fraction so step 0 keeps re-firing repeatedly.
        if (this.beatMachine.stutter > 0) {
          const stutterSubdiv = Math.pow(2, this.beatMachine.stutter + 1); // 4,8,16,32
          this.beatNextTime += (60 / this.transport.bpm) * (4 / stutterSubdiv);
        } else {
          this.beatNextTime += advance;
        }
        this.beatNextStep++;
      }
      // Re-check enable state before scheduling the next poll, so a
      // disable that happens during the while-loop's work above doesn't
      // queue a useless 25ms-later wakeup.
      if (!this.beatMachine.enabled || !this.transport.isPlaying) {
        this.beatTimerId = null;
        return;
      }
      this.beatTimerId = window.setTimeout(fire, 25);
    };
    fire();
  }

  /** Fire all enabled hits for a given step at `when`. Applies per-step
   *  velocity, probability roll, micro-shift, repeats/stutter, the
   *  layered secondary kit, and round-robin sample variants. Pulled out
   *  of scheduleBeatTicks so it can also be invoked directly from
   *  scheduleDrumHit-style fire-and-forget paths (e.g., MIDI). */
  private fireStep(
    ctx: BaseAudioContext,
    dest: AudioNode,
    pattern: BeatPattern,
    stepIndex: number,
    when: number,
  ) {
    for (const lane of DRUM_LANES) {
      if (!pattern[lane][stepIndex]) continue;
      const opts: BeatStepOptions | undefined =
        this.beatMachine.stepOptions[lane]?.[stepIndex];
      // Probability gate — roll once per step per lane.
      if (opts?.probability !== undefined && opts.probability < 1) {
        if (Math.random() > opts.probability) continue;
      }
      const velocity = opts?.velocity ?? 1;
      const microShiftMs = opts?.microShiftMs ?? 0;
      const humanizeMs = this.beatMachine.humanizeMs;
      const jitterMs = humanizeMs > 0 ? (Math.random() * 2 - 1) * humanizeMs : 0;
      // Clamp the total micro-shift so it can't drift before `when` -
      // negative shifts that put us in the past would no-op silently.
      const shiftSec = Math.max(-0.04, (microShiftMs + jitterMs) / 1000);
      const baseWhen = when + shiftSec;
      // Pick the sample buffer: primary or one of the round-robin
      // variants. Advance the per-lane cursor each consecutive hit.
      let sampleBuffer = this.beatLaneSamples[lane];
      const variants = this.beatLaneVariants[lane];
      if (sampleBuffer && variants.length > 0) {
        const cursor = this.beatLaneVariantCursor[lane] ?? 0;
        const totalPool = 1 + variants.length;
        const pick = cursor % totalPool;
        sampleBuffer = pick === 0 ? this.beatLaneSamples[lane] : (variants[pick - 1] ?? sampleBuffer);
        this.beatLaneVariantCursor[lane] = cursor + 1;
      }
      // Reverse the chosen buffer if the lane has that flag. We cache
      // the reversed copy per source AudioBuffer so we don't allocate
      // on every hit. Synth-only lanes (no sample) ignore the flag.
      if (sampleBuffer && this.beatMachine.laneReversed[lane]) {
        sampleBuffer = this.getOrBuildReversedBuffer(sampleBuffer);
      }
      // Per-lane pitch offset in semitones — passed straight to
      // scheduleDrumHit so the kit synth detunes and the sample's
      // playbackRate adjusts to match. Step-level pitch in
      // BeatStepOptions could compose on top later if we want microtonal
      // accents; for now lane-level is the producer-visible knob.
      const laneSemis = this.beatMachine.laneSemis[lane] ?? 0;
      const laneEq = this.beatMachine.laneEqSettings[lane];
      // Repeats — fire the hit once, then again 1..3 additional times
      // squeezed into half the next step's duration. Halves velocity on
      // each repeat so the burst tails off naturally.
      const repeats = Math.max(0, Math.min(3, opts?.repeats ?? 0));
      const stepDur = 60 / this.transport.bpm / STEPS_PER_BEAT;
      const spacing = repeats > 0 ? (stepDur * 0.5) / (repeats + 1) : 0;
      for (let r = 0; r <= repeats; r++) {
        const repeatWhen = baseWhen + r * spacing;
        const repeatVel = velocity * Math.pow(0.7, r);
        scheduleDrumHit(ctx, dest, lane, {
          when: repeatWhen,
          velocity: repeatVel,
          kit: this.beatMachine.kit,
          pitchSemis: laneSemis,
          sampleBuffer,
          laneEq,
        });
        // Layered secondary kit — synth only (no sample) so we don't
        // double the same one-shot. Re-uses the same lane EQ template.
        const layerKit = this.beatMachine.layerKitB[lane];
        if (layerKit && layerKit !== this.beatMachine.kit) {
          scheduleDrumHit(ctx, dest, lane, {
            when: repeatWhen,
            velocity: repeatVel * 0.85,
            kit: layerKit,
            pitchSemis: laneSemis,
            sampleBuffer: null,
            laneEq,
          });
        }
        // Resonator tail (#19) — short pitched sine layer tuned to the
        // lane's center frequency. Scaled by both the resonator amount
        // and the hit velocity so soft hits get a soft tail. Skipped
        // when resonator is 0 (the default).
        const resAmount = this.beatMachine.laneResonator[lane] ?? 0;
        if (resAmount > 0) {
          this.scheduleResonatorTail(
            ctx,
            dest,
            lane,
            repeatWhen,
            repeatVel * resAmount,
            laneSemis,
          );
        }
      }
    }
  }

  /** Fire a short pitched sine tail tuned to the lane's synth-center
   *  frequency. Adds harmonic "body" to flat one-shots. Voice is
   *  intentionally minimal — one oscillator, one envelope — so we can
   *  layer it on top of every drum hit without CPU concerns. */
  private scheduleResonatorTail(
    ctx: BaseAudioContext,
    dest: AudioNode,
    lane: DrumKind,
    when: number,
    amount: number,
    pitchSemis: number,
  ) {
    const centerHz = SYNTH_LANE_CENTERS_HZ[lane] ?? 220;
    const freq = centerHz * Math.pow(2, pitchSemis / 12);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, when);
    // Slight downward sweep adds "pluck" feel rather than a static tone.
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(40, freq * 0.7),
      when + 0.18,
    );
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(amount * 0.18, when + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    osc.connect(amp).connect(dest);
    osc.start(when);
    osc.stop(when + 0.25);
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
                sampleBuffer: this.beatLaneSamples[lane],
                laneEq: this.beatMachine.laneEqSettings[lane],
              });
            }
          }
        }
      }
    }
    return offline.startRendering();
  }

  /**
   * Construct an FX chain (EQ → comp → vocal bus → reverb → delay) inside an
   * OfflineAudioContext that mirrors the live track's parameter values.
   * Returns the input node (route source/drum hits in here) and the
   * output node (connect to master).
   */
  private buildOfflineChain(
    offline: OfflineAudioContext,
    state: TrackState,
  ): { inNode: GainNode; outNode: GainNode; reverbSend: GainNode; delaySend: GainNode } {
    const fx = completeTrackFx(state.fx);
    const fxIn = offline.createGain();
    const eqLow = offline.createBiquadFilter();
    eqLow.type = "lowshelf";
    eqLow.frequency.value = 200;
    eqLow.gain.value = fx.eqLowDb;
    const eqMid = offline.createBiquadFilter();
    eqMid.type = "peaking";
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 1;
    eqMid.gain.value = fx.eqMidDb;
    const eqHigh = offline.createBiquadFilter();
    eqHigh.type = "highshelf";
    eqHigh.frequency.value = 5000;
    eqHigh.gain.value = fx.eqHighDb;
    const compMix = offline.createGain();
    if (fx.compEnabled) {
      const comp = offline.createDynamicsCompressor();
      comp.threshold.value = fx.compThreshDb;
      comp.ratio.value = fx.compRatio;
      comp.knee.value = 6;
      comp.attack.value = 0.005;
      comp.release.value = 0.1;
      eqHigh.connect(comp);
      comp.connect(compMix);
    } else {
      eqHigh.connect(compMix);
    }
    const vocalBusDrive = offline.createGain();
    vocalBusDrive.gain.value = DB_TO_LINEAR(fx.vocalBusEnabled ? fx.vocalBusDriveDb : 0);
    const vocalBusSaturator = offline.createWaveShaper();
    vocalBusSaturator.curve = buildConsoleSaturationCurve(
      fx.vocalBusEnabled ? fx.vocalBusDriveDb / 18 : 0,
    );
    // Match live chain — 4x oversample so the rendered bounce matches what
    // the user was monitoring (the 2x→4x bump only helps if both paths agree).
    vocalBusSaturator.oversample = "4x";
    const vocalBusPresence = offline.createBiquadFilter();
    vocalBusPresence.type = "peaking";
    vocalBusPresence.frequency.value = 3200;
    vocalBusPresence.Q.value = 0.85;
    vocalBusPresence.gain.value = fx.vocalBusEnabled ? fx.vocalBusPresenceDb : 0;
    const vocalBusAir = offline.createBiquadFilter();
    vocalBusAir.type = "highshelf";
    vocalBusAir.frequency.value = 10500;
    vocalBusAir.gain.value = fx.vocalBusEnabled ? fx.vocalBusAirDb : 0;
    // Offline de-esser mirrors the live chain so renders match monitor.
    const vocalBusDeEss = offline.createBiquadFilter();
    vocalBusDeEss.type = "peaking";
    vocalBusDeEss.frequency.value = 6500;
    vocalBusDeEss.Q.value = 4;
    vocalBusDeEss.gain.value = fx.vocalBusEnabled
      ? Math.min(0, fx.vocalBusDeEssDb ?? 0)
      : 0;
    const vocalBusDryGain = offline.createGain();
    vocalBusDryGain.gain.value = fx.vocalBusEnabled ? 0.96 - fx.vocalBusCrush * 0.14 : 1;
    const vocalBusCrush = offline.createDynamicsCompressor();
    vocalBusCrush.threshold.value = -30;
    vocalBusCrush.knee.value = 10;
    vocalBusCrush.ratio.value = 14;
    vocalBusCrush.attack.value = 0.002;
    vocalBusCrush.release.value = 0.07;
    const vocalBusCrushGain = offline.createGain();
    vocalBusCrushGain.gain.value = fx.vocalBusEnabled ? fx.vocalBusCrush * 0.7 : 0;
    const vocalBusSum = offline.createGain();
    const gainNode = offline.createGain();
    gainNode.gain.value = DB_TO_LINEAR(state.gainDb);
    const panNode = offline.createStereoPanner();
    panNode.pan.value = state.pan;
    const outNode = offline.createGain();
    const reverbSend = offline.createGain();
    reverbSend.gain.value = fx.reverbWet;
    const delaySend = offline.createGain();
    delaySend.gain.value = fx.delayWet;

    // Wire (mirrors live chain).
    fxIn.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    compMix.connect(vocalBusDrive);
    vocalBusDrive.connect(vocalBusSaturator);
    vocalBusSaturator.connect(vocalBusPresence);
    vocalBusPresence.connect(vocalBusAir);
    vocalBusAir.connect(vocalBusDeEss);
    vocalBusDeEss.connect(vocalBusDryGain);
    vocalBusDeEss.connect(vocalBusCrush);
    vocalBusDryGain.connect(vocalBusSum);
    vocalBusCrush.connect(vocalBusCrushGain);
    vocalBusCrushGain.connect(vocalBusSum);
    vocalBusSum.connect(gainNode);
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
        vcaGroupId: t.state.vcaGroupId,
        automation: {
          gainDb: t.state.automation.gainDb.map((p) => ({ ...p })),
          pan: t.state.automation.pan.map((p) => ({ ...p })),
        },
        durationSec: t.state.durationSec,
        audioBlob,
      });
    }
    const laneSamples = DRUM_LANES.reduce((acc, lane) => {
      const buffer = this.beatLaneSamples[lane];
      const name = this.beatMachine.laneSampleNames[lane];
      if (!buffer || !name) {
        acc[lane] = null;
        return acc;
      }
      acc[lane] = {
        name,
        audioBlob: audioBufferToWav(buffer),
      };
      return acc;
    }, {} as Record<DrumKind, { name: string; audioBlob: Blob } | null>);

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
        inputMonitorMode: this.transport.inputMonitorMode,
        countInEnabled: this.transport.countInEnabled,
        countInBars: this.transport.countInBars,
        preRollSec: this.transport.preRollSec,
        loopRecordEnabled: this.transport.loopRecordEnabled,
        maxLoopTakes: this.transport.maxLoopTakes,
        soloMode: this.transport.soloMode,
        vcaGroups: this.transport.vcaGroups.map((g) => ({ ...g })),
        referenceMatchDb: this.transport.referenceMatchDb,
      },
      beat: {
        enabled: this.beatMachine.enabled,
        pattern: this.beatMachine.pattern,
        kit: this.beatMachine.kit,
        laneSamples,
        laneEqSettings: { ...this.beatMachine.laneEqSettings },
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
    this.setMonoPreview(false);
    this.transport.masterPhaseCorrelation = 1;
    this.transport.loopEnabled = file.transport.loopEnabled;
    this.transport.loopStartSec = file.transport.loopStartSec;
    this.transport.loopEndSec = file.transport.loopEndSec;
    this.transport.inputMonitorMode = file.transport.inputMonitorMode ?? "low-latency";
    this.transport.countInEnabled = file.transport.countInEnabled ?? true;
    this.transport.countInBars = file.transport.countInBars ?? 1;
    this.transport.preRollSec = file.transport.preRollSec ?? 1.5;
    this.transport.loopRecordEnabled = file.transport.loopRecordEnabled ?? false;
    this.transport.maxLoopTakes = file.transport.maxLoopTakes ?? 6;
    this.transport.soloMode = file.transport.soloMode ?? "sip";
    this.transport.vcaGroups = (file.transport.vcaGroups ?? []).map((g) => ({ ...g }));
    this.transport.referenceEnabled = false;
    this.transport.referenceMatchDb = file.transport.referenceMatchDb ?? 0;
    this.applyReferenceMonitoring();
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
    this.beatMachine.kit = file.beat.kit;
    this.beatMachine.laneSampleNames = emptyBeatLaneSampleNames();
    this.beatMachine.laneEqSettings = emptyBeatLaneEqSettings();
    if (file.beat.laneEqSettings) {
      for (const lane of DRUM_LANES) {
        const saved = file.beat.laneEqSettings[lane];
        if (!saved) continue;
        this.beatMachine.laneEqSettings[lane] = {
          hpHz: saved.hpHz,
          lpHz: saved.lpHz,
        };
      }
    }
    this.beatMachine.laneFrequencyProfiles = emptyBeatLaneFrequencyProfiles();
    this.beatLaneSamples = DRUM_LANES.reduce((acc, lane) => {
      acc[lane] = null;
      return acc;
    }, {} as Record<DrumKind, AudioBuffer | null>);
    for (const lane of DRUM_LANES) {
      const sample = file.beat.laneSamples?.[lane] ?? null;
      if (!sample) continue;
      try {
        const data = await sample.audioBlob.arrayBuffer();
        this.beatLaneSamples[lane] = await this.ctx.decodeAudioData(data.slice(0));
        this.beatMachine.laneSampleNames[lane] = sample.name;
      } catch (err) {
        console.warn("[DawEngine] failed to hydrate beat lane sample", { lane, err });
      }
    }
    this.refreshBeatLaneFrequencyProfiles();
    this.midi = {
      ...this.midi,
      wave: file.midi.wave,
      attackSec: file.midi.attackSec,
      releaseSec: file.midi.releaseSec,
      filterHz: file.midi.filterHz,
    };

    // Restore tracks.
    for (const t of file.tracks) {
      const fx = completeTrackFx(t.fx);
      const id = this.addTrack(t.name, t.color);
      this.setTrackGainDb(id, t.gainDb);
      this.setTrackPan(id, t.pan);
      this.setTrackMute(id, t.muted);
      this.setTrackSolo(id, t.solo);
      this.setTrackArmed(id, t.armed);
      this.setTrackEq(id, "low", fx.eqLowDb);
      this.setTrackEq(id, "mid", fx.eqMidDb);
      this.setTrackEq(id, "high", fx.eqHighDb);
      this.setTrackComp(id, {
        threshDb: fx.compThreshDb,
        ratio: fx.compRatio,
        enabled: fx.compEnabled,
        parallelBlend: fx.compParallelBlend ?? 0,
      });
      this.setTrackVocalBus(id, {
        enabled: fx.vocalBusEnabled,
        driveDb: fx.vocalBusDriveDb,
        presenceDb: fx.vocalBusPresenceDb,
        airDb: fx.vocalBusAirDb,
        crush: fx.vocalBusCrush,
        deEssDb: fx.vocalBusDeEssDb,
      });
      this.setTrackReverb(id, { wet: fx.reverbWet, decaySec: fx.reverbDecaySec });
      this.setTrackDelay(id, {
        wet: fx.delayWet,
        beats: fx.delayBeats,
        feedback: fx.delayFeedback,
      });
      this.setTrackGroup(id, t.vcaGroupId ?? null);
      for (const p of t.automation?.gainDb ?? []) {
        this.setTrackAutomationPoint(id, "gainDb", p.timeSec, p.valueDb);
      }
      for (const p of t.automation?.pan ?? []) {
        this.setTrackAutomationPoint(id, "pan", p.timeSec, p.value);
      }

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

  private estimateBufferOversampledTruePeak(buffer: AudioBuffer): number {
    let peak = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      const chPeak = this.estimateOversampledTruePeak(data);
      if (chPeak > peak) peak = chPeak;
    }
    return peak;
  }

  private applyBufferTrimGain(buffer: AudioBuffer, gain: number) {
    const safe = Math.max(0, Math.min(2, gain));
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.max(-1, Math.min(1, (data[i] ?? 0) * safe));
      }
    }
  }

  /** Render mix → WAV blob. Suitable for upload to /api/upload. */
  async exportWav(options: RenderMixOptions = { quality: "ultra" }): Promise<Blob> {
    const quality = options.quality ?? "ultra";
    const buf = await this.renderMix({ quality });
    const targetDbtp = options.truePeakCeilingDbtp;
    if (typeof targetDbtp === "number" && Number.isFinite(targetDbtp)) {
      const peak = this.estimateBufferOversampledTruePeak(buf);
      const peakDbtp = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
      if (peakDbtp > targetDbtp) {
        const trimDb = targetDbtp - peakDbtp;
        const trimLinear = Math.pow(10, trimDb / 20);
        this.applyBufferTrimGain(buf, trimLinear);
      }
    }
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
      key === "filterHz" ||
      key === "glideSec" ||
      key === "filterVelocityModHz"
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
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    // MPE-style velocity-to-filter: harder notes open the cutoff
    // further. When `filterVelocityModHz` is 0 the filter sits at the
    // user-set base value (legacy behavior). Otherwise we add
    // velocity * modRange so soft notes are darker, hard notes brighter.
    const baseFilterHz = this.midi.filterHz;
    const velMod = Math.max(0, this.midi.filterVelocityModHz);
    const filterFreq = Math.max(
      80,
      Math.min(20000, baseFilterHz + velocity * velMod),
    );
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.7;
    const amp = ctx.createGain();
    amp.gain.value = 0;
    osc.connect(filter).connect(amp).connect(target.fxIn);

    const now = ctx.currentTime;
    // Glide / portamento — when glideSec > 0 the new note pitch-ramps
    // from the previous note's frequency. lastSynthFreq is null on the
    // very first note (or after the user has globally stopped), so the
    // first note still starts on-pitch. Glide is exponential because
    // pitch perception is logarithmic — linearRampToValueAtTime would
    // feel slow at the top and snappy at the bottom.
    const glide = Math.max(0, this.midi.glideSec);
    if (glide > 0 && this.lastSynthFreq && this.lastSynthFreq > 0) {
      osc.frequency.setValueAtTime(this.lastSynthFreq, now);
      osc.frequency.exponentialRampToValueAtTime(freq, now + glide);
    } else {
      osc.frequency.value = freq;
    }
    this.lastSynthFreq = freq;
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
      transport: {
        ...this.transport,
        vcaGroups: this.transport.vcaGroups.map((g) => ({ ...g })),
      },
      tracks: Array.from(this.tracks.values()).map((t) => ({
        ...t.state,
        fx: { ...t.state.fx },
        automation: {
          gainDb: t.state.automation.gainDb.map((p) => ({ ...p })),
          pan: t.state.automation.pan.map((p) => ({ ...p })),
        },
        compLanes: t.state.compLanes.map((lane) => ({ ...lane })),
        compSegmentLaneIds: [...t.state.compSegmentLaneIds],
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
        layerKitB: { ...this.beatMachine.layerKitB },
        laneSemis: { ...this.beatMachine.laneSemis },
        laneReversed: { ...this.beatMachine.laneReversed },
        laneNames: { ...this.beatMachine.laneNames },
        laneResonator: { ...this.beatMachine.laneResonator },
        laneSampleNames: { ...this.beatMachine.laneSampleNames },
        laneVariantNames: DRUM_LANES.reduce((acc, lane) => {
          acc[lane] = [...this.beatMachine.laneVariantNames[lane]];
          return acc;
        }, {} as Record<DrumKind, string[]>),
        laneEqSettings: { ...this.beatMachine.laneEqSettings },
        laneFrequencyProfiles: { ...this.beatMachine.laneFrequencyProfiles },
        stepOptions: cloneStepOptions(this.beatMachine.stepOptions),
        bankStepOptions: {
          A: cloneStepOptions(this.beatMachine.bankStepOptions.A),
          B: cloneStepOptions(this.beatMachine.bankStepOptions.B),
          C: cloneStepOptions(this.beatMachine.bankStepOptions.C),
          D: cloneStepOptions(this.beatMachine.bankStepOptions.D),
        },
        swing: this.beatMachine.swing,
        humanizeMs: this.beatMachine.humanizeMs,
        stutter: this.beatMachine.stutter,
        fillsEnabled: this.beatMachine.fillsEnabled,
        queuedBank: this.beatMachine.queuedBank,
        fillPreset: this.beatMachine.fillPreset,
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
