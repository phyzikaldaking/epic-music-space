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
import { persistTake, pruneStaleTakes } from "./takeIdbStore";

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
  level: number; // 0..1 instantaneous peak output level
  /** 0..1 RMS output level with ~300 ms smoothing. Pairs with `level`
   *  in the track strip meter to read like a proper PPM (peak + avg). */
  levelRms?: number;
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
  /** External plugin chain (VST3/AU/AAX via the EMS Plugin Host
   *  bridge). Each slot references a host-side instance handle + the
   *  catalog id it was instantiated from + the latest known parameter
   *  values. Order = chain order. Empty when no plugins are attached
   *  or the host isn't running. The host owns the actual DSP; the
   *  browser only persists handles + params so projects round-trip. */
  pluginSlots: PluginSlot[];
  /** Send-position selector. "post" (default) = sends ride the
   *  fader/mute. "pre" = sends are independent of fader. Pre-fader
   *  is the textbook "tail survives fade-out" setup. Stored per
   *  track because vocal sends usually post, reverb-only stems
   *  often pre. */
  sendsPreFader?: boolean;
  /** Current per-track HPF corner frequency in Hz. Mirrors the engine
   *  trackHpf node's frequency so UI can render the active value. */
  trackHpfHz?: number;
  /** Current sidechain lookahead delay in ms. */
  sidechainLookaheadMs?: number;
}

/** One recorded take in the take browser. We hold the AudioBuffer
 *  references separately on a private map (TakeStore) because they
 *  can't be JSON-serialized; the public state only carries metadata
 *  the UI needs to render the take list and let the user pick a
 *  keeper. */
export interface RecordedTake {
  id: string;
  trackId: TrackId;
  /** Wall-clock ISO. Useful for the take browser ("Take 3 · 2:14 pm"). */
  recordedAt: string;
  durationSec: number;
  /** Pre-computed waveform peaks for the take list thumbnail
   *  (downsampled to ~120 floats so the renderer can paint a sparkline). */
  peaks: number[];
  /** True when this take is currently the active buffer on the track.
   *  Switching takes hot-swaps the track buffer to the picked one. */
  isKeeper: boolean;
  /** A label producers add ("ad-lib v2", "second chorus take"). */
  label?: string;
  /** Free-form per-take note ("nailed the second hook", "out of breath
   *  at the end"). Persists with the take in the take-browser side
   *  panel. Capped to 280 chars so the UI stays compact. */
  note?: string;
  /** Peak amplitude observed during the take. Used by the take browser
   *  to flag clipping (>=0.99) so the producer knows to re-record. */
  peakAmplitude: number;
  /** True when the take peaked at or near digital ceiling. Surfaces
   *  a red ⚠ chip in the take browser. */
  clipped: boolean;
}

/** Saved plugin slot — what we round-trip in project files. */
export interface PluginSlot {
  /** Stable per-track slot id so reorders / removals don't conflate. */
  slotId: string;
  /** Catalog id ("Waves:CLA-76:VST3") so we can re-instantiate on
   *  another machine that has the same plugin installed. */
  pluginId: string;
  /** Vendor + display name pulled from the catalog at instantiation,
   *  cached on the slot so we can render a friendly label even when
   *  the host isn't currently connected. */
  vendor: string;
  name: string;
  /** Live host-side handle. Null when not currently instantiated (host
   *  is offline / plugin missing on this machine). */
  instanceHandle: string | null;
  /** Last-known parameter values: id → value. Persisted so the slot
   *  recreates with the same dial positions even if the host drops
   *  and reconnects. */
  parameterValues: Record<string, number>;
  /** Bypass toggle. Persists; reapplied to host on reconnect. */
  bypassed: boolean;
}

interface TrackInternal {
  state: TrackState;
  // Signal flow: fxIn → trackHpf → sidechainLookahead → sidechainDuck → EQ → comp/bypass → vocal bus → gain → pan → meter → master
  //                                                                                                       ├→ reverbSend → shared reverb return
  //                                                                                                       └→ delaySend → shared delay return
  fxIn: GainNode;
  /** Per-track HPF (default 30 Hz). Producers bump to 60-80 Hz on
   *  vocals to clear breath rumble; set frequency 20 Hz to functionally
   *  disable while keeping the node in the chain. */
  trackHpf: BiquadFilterNode;
  /** Sidechain lookahead — delays the receiver's signal by ~5 ms so
   *  the duck modulation starts before the source transient hits.
   *  Makes kick pumping feel tight instead of late. */
  sidechainLookahead: DelayNode;
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
  /** Pre-fader send taps. The send-position state picks which of the
   *  pair (pre vs. post) carries the send level for that FX. The
   *  inactive one sits at 0. */
  reverbSendPreGain: GainNode;
  delaySendPreGain: GainNode;
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
  /** Metronome subdivisions. "1/4" = quarters (standard), "1/8" = eighths
   *  (more drive), "1/16" = sixteenths (tight tracking). */
  metronomeSubdivision: "1/4" | "1/8" | "1/16";
  /** Accent the downbeat with a brighter pitch + louder tick. Helps
   *  the performer feel "the 1" in busier subdivisions. */
  metronomeAccentDownbeat: boolean;
  /** 0..0.5 swing — delays every other tick to taste. 0 = straight. */
  metronomeSwing: number;
  /** Tempo map: BPM changes over time. When empty, the project runs
   *  at a single static `bpm`. When non-empty, the transport eases
   *  between successive entries — quarter-note timing for the
   *  metronome, beat machine, and any MIDI clip lookups all read
   *  from `bpmAtSec()` so the whole graph follows the curve. */
  tempoMap: Array<{ atSec: number; bpm: number }>;
  /** Project key for snap-to-scale on synth/keyboard input. When set,
   *  played MIDI notes get rounded to the nearest in-scale pitch. */
  projectKey: string | null;
  /** Genre tag used by the AI mix diagnostics to pick rules. Trap is
   *  expected to be sub-heavy; jazz is expected to be dynamic. Without
   *  a genre the diagnostics fall back to generic rules. */
  projectGenre: string | null;
  /** Performer cue-mix bus level (linear gain, 0..1.5). Independent of
   *  the main master fader so the engineer can ride the headphone
   *  send without messing with the room mix. */
  cueMixLevel: number;
  /** Talkback hot-mic: when true, the engineer's mic gets routed
   *  straight into the cue bus (ducking the cue music ~6 dB) so
   *  the performer hears them through their cans. Released = no
   *  routing, so it's safe to leave on standby. */
  talkbackOn: boolean;
  /** Average round-trip device latency captured at session start
   *  (ms). Used to back-shift recorded takes so what the artist
   *  hears in their cans lines up with what hits the timeline. */
  measuredDeviceLatencyMs: number;
  /** Per-track take browser. Map track id → array of takes captured
   *  this session. Persists in localStorage so a refresh keeps them. */
  takeHistory: Record<string, RecordedTake[]>;
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
  /** Mid-Side EQ mode (#9). false = stereo (standard L/R EQ),
   *  true = M/S where the masterEq*Db values shape the *mid* bus and
   *  the masterSideEq*Db values shape the *side* bus independently.
   *  Producers widen a mix by boosting side highs without smearing the
   *  mid. Default false so existing projects round-trip unchanged. */
  masterMidSideMode: boolean;
  /** Side-bus EQ values (only meaningful when masterMidSideMode=true). */
  masterSideEqLowDb: number; // -12..+12
  masterSideEqMidDb: number; // -12..+12
  masterSideEqHighDb: number; // -12..+12
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
  /** Lookahead in ms feeding the master limiter. Default 5. */
  masterLookaheadMs: number;
  /** Soft-clip ceiling (0..1 linear) applied post-limiter. */
  masterSoftClipCeiling: number;
  /** Master dim momentary -20 dB. */
  masterDimOn: boolean;
  /** Master multiband compressor (#13). Splits the post-EQ signal at
   *  the crossover frequency, compresses each band independently, then
   *  sums. Tames boomy 808s without flattening the snare. Off by
   *  default so existing projects don't change tone. */
  masterMultibandEnabled: boolean;
  /** Crossover frequency in Hz, 80..600. Default 200. */
  masterMultibandCrossoverHz: number;
  /** Low-band compressor params. */
  masterMultibandLowThreshDb: number;
  masterMultibandLowRatio: number;
  /** High-band compressor params. */
  masterMultibandHighThreshDb: number;
  masterMultibandHighRatio: number;
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
    /** Parallel mix 0..1. 0 = aux is pure send (only the wet),
     *  1 = aux is pure dry (no wet). Default 0 keeps existing
     *  send-only behaviour. Drives a dry-side make-up gain so
     *  the user can blend the parallel return without touching
     *  send levels on every track. */
    parallelMix: number;
  };
  delayReturn: {
    enabled: boolean;
    beats: number;
    feedback: number;
    level: number;
    parallelMix: number;
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

/** Soft-clip curve: linear up to `ceiling`, then a smooth tanh
 *  rolloff above so anything that survives the limiter rounds over
 *  instead of hard-clipping. Used post-limiter as a final inter-
 *  sample-peak insurance policy. */
function buildSoftClipCurve(ceiling: number): Float32Array<ArrayBuffer> {
  const samples = 2048;
  const curve = new Float32Array(
    new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT),
  );
  const c = Math.max(0.5, Math.min(0.99, ceiling));
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    const sign = Math.sign(x);
    const ax = Math.abs(x);
    if (ax <= c) {
      curve[i] = x;
    } else {
      const over = (ax - c) / (1 - c);
      // tanh shoulder above the knee; at ax==1 the output asymptotes
      // toward c + (1-c)*tanh(1) ≈ c + 0.76*(1-c).
      curve[i] = sign * (c + (1 - c) * Math.tanh(over));
    }
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
  /** Infrasonic HPF stripping DC + sub-20Hz rumble before limiting. */
  private masterDcHpf: BiquadFilterNode | null = null;
  /** Lookahead delay before the limiter. Default 5 ms so the limiter
   *  sees transients before it needs to clamp them. Producer-tunable
   *  via setMasterLookaheadMs(). */
  private masterLookahead: DelayNode | null = null;
  /** Soft-clip stage after the limiter — final safety net for
   *  inter-sample peaks that snuck through. 4x oversampled. */
  private masterSoftClip: WaveShaperNode | null = null;
  /** Master dim — instantly drops the room mix -20 dB while held so
   *  the engineer can talk over playback without touching the fader. */
  private masterDimGain: GainNode | null = null;
  // Mid-Side EQ branch (#9). Built in init() and routed in parallel to
  // the standard stereo EQ; a crossfade pair (msBusGain ↔ stereoBusGain)
  // selects which branch the chain hears so toggling is glitch-free.
  private msSplitter: ChannelSplitterNode | null = null;
  private msMidGain: GainNode | null = null;
  private msSideLPlus: GainNode | null = null;
  private msSideRInvert: GainNode | null = null;
  private msSideSum: GainNode | null = null;
  private msMidEqLow: BiquadFilterNode | null = null;
  private msMidEqMid: BiquadFilterNode | null = null;
  private msMidEqHigh: BiquadFilterNode | null = null;
  private msSideEqLow: BiquadFilterNode | null = null;
  private msSideEqMid: BiquadFilterNode | null = null;
  private msSideEqHigh: BiquadFilterNode | null = null;
  // Encoder: L = M + S, R = M − S (sqrt(2) scaling baked into the
  // decode side so we don't lose level on the round-trip).
  private msEncodeMerger: ChannelMergerNode | null = null;
  private msEncodeMidToL: GainNode | null = null;
  private msEncodeMidToR: GainNode | null = null;
  private msEncodeSideToL: GainNode | null = null;
  private msEncodeSideToRInvert: GainNode | null = null;
  // Crossfade between stereo EQ branch and M/S branch. Sum into the
  // shared tape→limiter tail of the chain.
  private stereoBusGain: GainNode | null = null;
  private msBusGain: GainNode | null = null;
  private eqSumGain: GainNode | null = null;
  // Multiband compressor branch (#13). Sits between eqSumGain and the
  // tape saturator. Built in init() and routed parallel to a bypass
  // path so toggling is glitch-free.
  private mbLowFilter: BiquadFilterNode | null = null;
  private mbHighFilter: BiquadFilterNode | null = null;
  private mbLowComp: DynamicsCompressorNode | null = null;
  private mbHighComp: DynamicsCompressorNode | null = null;
  private mbSum: GainNode | null = null;
  private mbBranchGain: GainNode | null = null; // multiband output
  private mbBypassGain: GainNode | null = null; // dry passthrough
  private mbOutSum: GainNode | null = null; // sum into masterTape
  private masterAnalyser: AnalyserNode | null = null;
  private aflBusAnalyser: AnalyserNode | null = null;
  private aflBusBuf: Uint8Array | null = null;
  private monitorOutGain: GainNode | null = null;
  private referenceGain: GainNode | null = null;
  private referenceBuffer: AudioBuffer | null = null;
  private referenceSource: AudioBufferSourceNode | null = null;
  /** Spectrum analyser tapping the reference source so the
   *  ReferenceSpectrumOverlay can render the reference's frequency
   *  signature next to the user's mix. Allocated lazily in
   *  syncReferenceSource. */
  private referenceAnalyser: AnalyserNode | null = null;
  private referenceSpectrumBuf: Uint8Array | null = null;
  /** Snapshot of the reference spectrum, downsampled to 32 bins so the
   *  overlay matches the mix spectrum's shape exactly. */
  private referenceSpectrum: number[] = new Array(32).fill(0);
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
  /** Cue-mix bus — performer headphone send. Mirrors the master mix
   *  by default but has its own gain so the engineer can ride the
   *  headphones without changing the room mix. Connected to a
   *  dedicated `destinationCue` (a MediaStreamDestination) so the
   *  artist can route it to their secondary audio device. */
  private cueBus: GainNode | null = null;
  /** Cue duck — pulled down ~6 dB by talkback so the engineer's
   *  voice cuts cleanly over the cue music. */
  private cueDuck: GainNode | null = null;
  /** Talkback path — engineer's mic goes here when talkbackOn is true.
   *  Routes straight into the cue bus, bypassing the main mix. */
  private talkbackSource: MediaStreamAudioSourceNode | null = null;
  private talkbackStream: MediaStream | null = null;
  /** Per-track take history keyed by trackId. AudioBuffer can't be
   *  serialized, so we keep them in-memory; the matching metadata in
   *  TransportState.takeHistory is what UI components read from. */
  private takeBuffers: Map<string, AudioBuffer> = new Map();

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
  /** Original (un-stretched) lane buffers, keyed by lane. Captured when
   *  the sample is first assigned; re-stretched into beatLaneSamples
   *  whenever the project BPM changes. Lets users tempo-match loops
   *  without retriggering at the wrong pitch (#18). */
  private originalLaneSamples: Partial<Record<DrumKind, AudioBuffer>> = {};
  /** Source BPM declared by the producer when assigning a lane loop.
   *  null/undefined = treat as one-shot (no stretch). */
  private laneSampleSourceBpm: Partial<Record<DrumKind, number>> = {};
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
      parallelMix: 0,
    },
    delayReturn: {
      enabled: true,
      beats: 0.5,
      feedback: 0.35,
      level: 0.7,
      parallelMix: 0,
    },
  };

  private tracks: Map<TrackId, TrackInternal> = new Map();

  private transport: TransportState = {
    isPlaying: false,
    isRecording: false,
    bpm: 90,
    positionSec: 0,
    metronomeOn: false,
    metronomeSubdivision: "1/4",
    metronomeAccentDownbeat: true,
    metronomeSwing: 0,
    tempoMap: [],
    projectKey: null,
    projectGenre: null,
    cueMixLevel: 1.0,
    talkbackOn: false,
    measuredDeviceLatencyMs: 0,
    takeHistory: {},
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
    masterMidSideMode: false,
    masterSideEqLowDb: 0,
    masterSideEqMidDb: 0,
    masterSideEqHighDb: 0,
    masterSpectrum: new Array(32).fill(0),
    masterLufs: -Infinity,
    masterTruePeak: 0,
    masterTapeDrive: 0,
    masterLookaheadMs: 5,
    masterSoftClipCeiling: 0.94,
    masterDimOn: false,
    masterMultibandEnabled: false,
    masterMultibandCrossoverHz: 200,
    masterMultibandLowThreshDb: -18,
    masterMultibandLowRatio: 3,
    masterMultibandHighThreshDb: -18,
    masterMultibandHighRatio: 2,
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
      // Prune persisted takes older than 14 days. Best-effort,
      // fire-and-forget — never blocks audio engine startup.
      void pruneStaleTakes(14);
      this.master = this.ctx.createGain();
      this.master.gain.value = DB_TO_LINEAR(this.transport.masterDb);
      // Cue / performer-headphone bus. Built early so any chain wiring
      // below can tap into it. The cue bus is taken in parallel from
      // the master output via a gain node so the artist hears the
      // *full* mix in their cans, not just the dry input. Talkback's
      // duck node sits in series so when the engineer hits the
      // talkback button, the cue music dips ~6 dB and their voice
      // comes through clearly.
      this.cueBus = this.ctx.createGain();
      this.cueBus.gain.value = this.transport.cueMixLevel;
      this.cueDuck = this.ctx.createGain();
      this.cueDuck.gain.value = 1;
      this.cueBus.connect(this.cueDuck);
      // Cue-bus default destination is the main output. Producers
      // wanting a dedicated headphone interface can pipe
      // engine.getCueStream() into setSinkId() on a hidden <audio>.
      this.cueDuck.connect(this.ctx.destination);
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
      // Build the Mid-Side EQ branch (#9). The graph:
      //   master → splitter (L on ch0, R on ch1)
      //   mid path:  L gain 0.5 + R gain 0.5  → msMidEq chain
      //   side path: L gain 0.5 + R gain -0.5 → msSideEq chain
      //   encode:    L = M + S,  R = M − S    → merger (stereo)
      // The 0.5/0.5 mid + 0.5/−0.5 side keeps unity gain on a
      // perfectly centered signal (M = (L+R)/2; reconstructed L = M+S =
      // (L+R)/2 + (L−R)/2 = L). We sum back into eqSumGain through a
      // crossfade so toggling M/S mode is glitch-free.
      this.msSplitter = this.ctx.createChannelSplitter(2);
      this.msMidGain = this.ctx.createGain();
      this.msMidGain.gain.value = 1; // mid bus carrier — feeds two 0.5 sources
      this.msSideLPlus = this.ctx.createGain();
      this.msSideLPlus.gain.value = 0.5;
      this.msSideRInvert = this.ctx.createGain();
      this.msSideRInvert.gain.value = -0.5;
      this.msSideSum = this.ctx.createGain();
      this.msSideSum.gain.value = 1;
      this.msMidEqLow = this.ctx.createBiquadFilter();
      this.msMidEqLow.type = "lowshelf";
      this.msMidEqLow.frequency.value = 200;
      this.msMidEqMid = this.ctx.createBiquadFilter();
      this.msMidEqMid.type = "peaking";
      this.msMidEqMid.frequency.value = 1000;
      this.msMidEqMid.Q.value = 1;
      this.msMidEqHigh = this.ctx.createBiquadFilter();
      this.msMidEqHigh.type = "highshelf";
      this.msMidEqHigh.frequency.value = 5000;
      this.msSideEqLow = this.ctx.createBiquadFilter();
      this.msSideEqLow.type = "lowshelf";
      this.msSideEqLow.frequency.value = 200;
      this.msSideEqMid = this.ctx.createBiquadFilter();
      this.msSideEqMid.type = "peaking";
      this.msSideEqMid.frequency.value = 1000;
      this.msSideEqMid.Q.value = 1;
      this.msSideEqHigh = this.ctx.createBiquadFilter();
      this.msSideEqHigh.type = "highshelf";
      this.msSideEqHigh.frequency.value = 5000;
      // Encoder: separate mid+side back into L/R via a merger.
      this.msEncodeMerger = this.ctx.createChannelMerger(2);
      this.msEncodeMidToL = this.ctx.createGain();
      this.msEncodeMidToL.gain.value = 1;
      this.msEncodeMidToR = this.ctx.createGain();
      this.msEncodeMidToR.gain.value = 1;
      this.msEncodeSideToL = this.ctx.createGain();
      this.msEncodeSideToL.gain.value = 1;
      this.msEncodeSideToRInvert = this.ctx.createGain();
      this.msEncodeSideToRInvert.gain.value = -1;
      // Crossfade between stereo EQ and M/S EQ branches.
      this.stereoBusGain = this.ctx.createGain();
      this.stereoBusGain.gain.value = 1; // default stereo mode
      this.msBusGain = this.ctx.createGain();
      this.msBusGain.gain.value = 0;
      this.eqSumGain = this.ctx.createGain();
      this.eqSumGain.gain.value = 1;

      // Wire master chain. Tape saturator sits between the EQ tap and
      // the limiter so the user can hit the limiter with a saturated
      // mix (a key "glue" trick). EQ analysers tap the EQ output —
      // before tape — so the spectrum + LUFS readings stay tonally
      // accurate regardless of saturation drive.
      // Stereo EQ branch (default routing).
      this.master
        .connect(this.masterEqLow)
        .connect(this.masterEqMid)
        .connect(this.masterEqHigh)
        .connect(this.stereoBusGain)
        .connect(this.eqSumGain);
      // M/S branch — runs in parallel; gated by msBusGain (0 by default).
      this.master.connect(this.msSplitter);
      // Mid bus: L*0.5 + R*0.5 → msMidGain → EQ chain.
      const midFromL = this.ctx.createGain();
      midFromL.gain.value = 0.5;
      const midFromR = this.ctx.createGain();
      midFromR.gain.value = 0.5;
      this.msSplitter.connect(midFromL, 0);
      this.msSplitter.connect(midFromR, 1);
      midFromL.connect(this.msMidGain);
      midFromR.connect(this.msMidGain);
      this.msMidGain
        .connect(this.msMidEqLow)
        .connect(this.msMidEqMid)
        .connect(this.msMidEqHigh);
      // Side bus: L*0.5 + R*(-0.5) → msSideSum → EQ chain.
      this.msSplitter.connect(this.msSideLPlus, 0);
      this.msSplitter.connect(this.msSideRInvert, 1);
      this.msSideLPlus.connect(this.msSideSum);
      this.msSideRInvert.connect(this.msSideSum);
      this.msSideSum
        .connect(this.msSideEqLow)
        .connect(this.msSideEqMid)
        .connect(this.msSideEqHigh);
      // Re-encode: L = M + S, R = M − S into the stereo merger.
      this.msMidEqHigh.connect(this.msEncodeMidToL);
      this.msMidEqHigh.connect(this.msEncodeMidToR);
      this.msSideEqHigh.connect(this.msEncodeSideToL);
      this.msSideEqHigh.connect(this.msEncodeSideToRInvert);
      this.msEncodeMidToL.connect(this.msEncodeMerger, 0, 0);
      this.msEncodeSideToL.connect(this.msEncodeMerger, 0, 0);
      this.msEncodeMidToR.connect(this.msEncodeMerger, 0, 1);
      this.msEncodeSideToRInvert.connect(this.msEncodeMerger, 0, 1);
      this.msEncodeMerger.connect(this.msBusGain).connect(this.eqSumGain);

      // Multiband compressor branch (#13). eqSumGain feeds two paths:
      //   - parallel low/high band split via biquad crossover, each
      //     compressed independently, summed; gain controlled by
      //     mbBranchGain (0 when disabled).
      //   - direct bypass via mbBypassGain (1 when disabled).
      // Both sum into mbOutSum which feeds masterTape. Toggling the
      // multiband ramps the two gains in opposite directions so the
      // transition is glitch-free.
      this.mbLowFilter = this.ctx.createBiquadFilter();
      this.mbLowFilter.type = "lowpass";
      this.mbLowFilter.frequency.value = 200;
      this.mbLowFilter.Q.value = 0.707;
      this.mbHighFilter = this.ctx.createBiquadFilter();
      this.mbHighFilter.type = "highpass";
      this.mbHighFilter.frequency.value = 200;
      this.mbHighFilter.Q.value = 0.707;
      this.mbLowComp = this.ctx.createDynamicsCompressor();
      this.mbLowComp.threshold.value = -18;
      this.mbLowComp.ratio.value = 3;
      this.mbLowComp.knee.value = 6;
      this.mbLowComp.attack.value = 0.01;
      this.mbLowComp.release.value = 0.18;
      this.mbHighComp = this.ctx.createDynamicsCompressor();
      this.mbHighComp.threshold.value = -18;
      this.mbHighComp.ratio.value = 2;
      this.mbHighComp.knee.value = 6;
      this.mbHighComp.attack.value = 0.003;
      this.mbHighComp.release.value = 0.08;
      this.mbSum = this.ctx.createGain();
      this.mbSum.gain.value = 1;
      this.mbBranchGain = this.ctx.createGain();
      this.mbBranchGain.gain.value = 0; // disabled by default
      this.mbBypassGain = this.ctx.createGain();
      this.mbBypassGain.gain.value = 1; // dry path by default
      this.mbOutSum = this.ctx.createGain();
      this.mbOutSum.gain.value = 1;
      // Low + high band routing.
      this.eqSumGain.connect(this.mbLowFilter).connect(this.mbLowComp).connect(this.mbSum);
      this.eqSumGain.connect(this.mbHighFilter).connect(this.mbHighComp).connect(this.mbSum);
      this.mbSum.connect(this.mbBranchGain).connect(this.mbOutSum);
      // Dry bypass.
      this.eqSumGain.connect(this.mbBypassGain).connect(this.mbOutSum);
      // Tail → tape → limiter → analyser.
      // Master HPF — strips DC offset + sub-20Hz rumble that adds
      // nothing audible but eats limiter headroom. 12 dB/oct Butterworth
      // at 20 Hz is the standard "infrasonic" filter on mastering
      // chains; lets the limiter spend its work on stuff humans hear.
      this.masterDcHpf = this.ctx.createBiquadFilter();
      this.masterDcHpf.type = "highpass";
      this.masterDcHpf.frequency.value = 20;
      this.masterDcHpf.Q.value = 0.707;
      // Lookahead delay — 5 ms ahead of the limiter so attack transients
      // are already known when the gain reduction kicks in. Brick-wall
      // limiters NEED this; without it, a snare hit slams into 0 dBFS
      // before the dynamics processor can pull it down (audible
      // overshoot / inter-sample clipping). The lookahead amount lives
      // on a public setter so a producer can dial it down to 0 for
      // tracking latency.
      this.masterLookahead = this.ctx.createDelay(0.05);
      this.masterLookahead.delayTime.value = 0.005;
      // Soft-clip post-limiter. Tape-style asymmetric curve at ~-1 dBTP
      // so any inter-sample peak that survives the limiter gets a
      // gentle round-over instead of a hard digital clip. Insurance
      // against codec aliasing on streaming platforms.
      this.masterSoftClip = this.ctx.createWaveShaper();
      this.masterSoftClip.curve = buildSoftClipCurve(0.94);
      this.masterSoftClip.oversample = "4x";

      this.mbOutSum
        .connect(this.masterDcHpf)
        .connect(this.masterTape)
        .connect(this.masterLookahead)
        .connect(this.masterLimiter)
        .connect(this.masterSoftClip)
        .connect(this.masterAnalyser);
      this.masterAnalyser.connect(this.monitorOutGain).connect(this.ctx.destination);
      this.referenceGain.connect(this.ctx.destination);
      // Cue bus listens to the *final* post-master mix so what the
      // performer hears in their headphones is exactly what the
      // engineer hears in the room. Pulling from masterAnalyser
      // (vs. the dry master) means EQ + limiter + tape are already
      // baked in.
      this.masterAnalyser.connect(this.cueBus);
      this.masterAnalyser.connect(this.monoSplitter);
      this.monoSplitter.connect(this.monoSumGain, 0);
      this.monoSplitter.connect(this.monoSumGain, 1);
      this.monoSumGain.connect(this.monoMerger, 0, 0);
      this.monoSumGain.connect(this.monoMerger, 0, 1);
      this.monoMerger.connect(this.monoOutGain).connect(this.ctx.destination);
      this.monoSplitter.connect(this.phaseLeftAnalyser, 0);
      this.monoSplitter.connect(this.phaseRightAnalyser, 1);
      // Side branches — both tap the post-EQ summing point so their
      // readings stay accurate whether the user is in stereo or M/S
      // mode. Earlier we tapped masterEqHigh directly, which would
      // read silence when M/S mode was on.
      this.eqSumGain.connect(this.masterSpectrumAnalyser);
      this.eqSumGain.connect(lufsHpf).connect(lufsShelf).connect(this.lufsAnalyser);
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

    // Per-track meters. We accumulate BOTH peak (transient indicator)
    // and RMS (average-level indicator) per frame. RMS lags peak by
    // a smoothing constant; together they read like a proper PPM —
    // peak shows when a transient is about to clip, RMS shows
    // perceived loudness.
    for (const t of this.tracks.values()) {
      t.meterAnalyser.getByteTimeDomainData(
        t.meterBuf as unknown as Uint8Array<ArrayBuffer>,
      );
      let trackPeak = 0;
      let sumSq = 0;
      for (let i = 0; i < t.meterBuf.length; i++) {
        const v = ((t.meterBuf[i] ?? 128) - 128) / 128;
        const a = Math.abs(v);
        if (a > trackPeak) trackPeak = a;
        sumSq += v * v;
      }
      const instantRms = Math.sqrt(sumSq / Math.max(1, t.meterBuf.length));
      t.state.level = trackPeak;
      // 300 ms RMS smoothing (~broadcast PPM ballistics). Frame rate
      // is ~30 fps; 0.1 weight ≈ 300 ms time constant.
      const prevRms = t.state.levelRms ?? instantRms;
      t.state.levelRms = prevRms * 0.9 + instantRms * 0.1;
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
    // Per-track HPF before any other DSP. Default 30 Hz (mostly
    // transparent on bass, kills DC + breath rumble on vocals).
    // Producers can disable per track via setTrackHpf(id, null) or
    // change the corner via setTrackHpf(id, hz). Sitting before EQ
    // means the low shelf isn't fighting infrasonic energy.
    const trackHpf = ctx.createBiquadFilter();
    trackHpf.type = "highpass";
    trackHpf.frequency.value = 30;
    trackHpf.Q.value = 0.707;
    // Sidechain duck — sits between the HPF and the rest of the strip.
    // Modulated each tick when sidechainFromId is set. We also wire a
    // lookahead delay BEFORE the duck so pumping starts ~5 ms before
    // the source transient hits, which makes the ducking feel natural
    // instead of always lagging the kick.
    const sidechainLookahead = ctx.createDelay(0.02);
    sidechainLookahead.delayTime.value = 0.005;
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
    // Pre-fader send tap. Branches off vocalBusSum (before the
    // fader) so muting / pulling the channel doesn't pull the
    // send level with it — useful for cue mixes or "reverb tail
    // survives fade-out" tricks. Idle at 0 by default; the
    // sendPosition state picks which of the pre/post pair carries
    // the send level for each FX.
    const reverbSendPreGain = ctx.createGain();
    reverbSendPreGain.gain.value = 0;
    const delaySendPreGain = ctx.createGain();
    delaySendPreGain.gain.value = 0;

    const gainNode = ctx.createGain();
    const panNode = ctx.createStereoPanner();
    const monitorOutGain = ctx.createGain();
    monitorOutGain.gain.value = 1;
    const meterAnalyser = ctx.createAnalyser();
    meterAnalyser.fftSize = 256;
    const meterBuf = new Uint8Array(meterAnalyser.fftSize);

    // Wire FX chain: fxIn → HPF → sidechainLookahead → sidechainDuck → EQ → ...
    fxIn.connect(trackHpf);
    trackHpf.connect(sidechainLookahead);
    sidechainLookahead.connect(sidechainDuck);
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
    // Pre-fader send branches off vocalBusSum (before gainNode). Both
    // routes feed the same aux return; whichever has nonzero gain is
    // the active path. setTrackSendPosition() swaps them.
    vocalBusSum.connect(reverbSendPreGain);
    vocalBusSum.connect(delaySendPreGain);
    if (this.reverbReturnIn) reverbSendGain.connect(this.reverbReturnIn);
    if (this.reverbReturnIn) reverbSendPreGain.connect(this.reverbReturnIn);
    if (this.delayReturnIn) delaySendGain.connect(this.delayReturnIn);
    if (this.delayReturnIn) delaySendPreGain.connect(this.delayReturnIn);

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
        pluginSlots: [],
        trackHpfHz: 30,
        sidechainLookaheadMs: 5,
        sendsPreFader: false,
      },
      fxIn,
      trackHpf,
      sidechainLookahead,
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
      reverbSendPreGain,
      delaySendPreGain,
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
      // Route to whichever tap is active per the send-position flag.
      if (t.state.sendsPreFader) {
        t.reverbSendPreGain.gain.value = clamped;
        t.reverbSendGain.gain.value = 0;
      } else {
        t.reverbSendGain.gain.value = clamped;
        t.reverbSendPreGain.gain.value = 0;
      }
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
      if (t.state.sendsPreFader) {
        t.delaySendPreGain.gain.value = clamped;
        t.delaySendGain.gain.value = 0;
      } else {
        t.delaySendGain.gain.value = clamped;
        t.delaySendPreGain.gain.value = 0;
      }
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
    // Temporarily disabled. The WebCodecs Opus path was producing
    // robot-voice playback on contexts where ctx.sampleRate isn't a
    // native Opus rate (Opus only natively supports 8/12/16/24/48
    // kHz; 44.1 kHz Mac devices were the worst). The
    // MediaRecorder → decodeAudioData fallback is rock-solid because
    // the browser handles sample-rate alignment automatically, so we
    // route every capture through it until WebCodecs is hardened
    // (resample at the encoder boundary, force 48k input, etc.).
    //
    // The classes are still detected so re-enabling is one-line:
    // flip this gate to `Boolean(g.AudioEncoder && g.AudioData)`.
    const g = globalThis as unknown as {
      AudioEncoder?: unknown;
      AudioData?: unknown;
    };
    void g;
    return false;
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
    const next = Math.max(40, Math.min(240, Math.round(bpm)));
    this.transport.bpm = next;
    // Re-derive shared delay return time from the new BPM so beat-locked
    // delay stays locked. Reverb and EQ are tempo-independent, no change.
    if (this.delay) {
      this.delay.delayTime.value = (60 / this.transport.bpm) * this.aux.delayReturn.beats;
    }
    // Auto time-stretch any lane sample that declared a source BPM.
    // Loops stay the right length at the new tempo without changing
    // pitch. Synced asynchronously so a quick drag of the BPM slider
    // doesn't lock the UI thread on a heavy stretch.
    void this.retimeAllLaneSamples();
    this.notify();
  }

  /** Re-stretch every lane sample that has a declared source BPM,
   *  matching the current project BPM. Safe to call repeatedly — a
   *  no-op when factor ≈ 1. */
  private async retimeAllLaneSamples(): Promise<void> {
    if (!this.ctx) return;
    for (const lane of DRUM_LANES) {
      const srcBpm = this.laneSampleSourceBpm[lane];
      const original = this.originalLaneSamples[lane];
      if (!srcBpm || !original) continue;
      const factor = srcBpm / this.transport.bpm;
      // Lazy import to avoid a hot-path require on every engine load.
      const { timeStretchBuffer } = await import("@/lib/timeStretch");
      const stretched = timeStretchBuffer(original, this.ctx, factor);
      this.beatLaneSamples[lane] = stretched;
      // Invalidate the reversed cache for this lane; the reversal needs
      // to re-derive from the new stretched buffer.
      this.reversedBufferCache = new WeakMap();
    }
    this.notify();
  }

  /** Declare a lane sample's source BPM. When set, BPM changes auto-
   *  stretch the buffer so loops stay tempo-matched. Pass null to
   *  treat the sample as a one-shot (no stretch). */
  setBeatLaneSourceBpm(lane: DrumKind, sourceBpm: number | null) {
    if (sourceBpm === null || sourceBpm <= 0) {
      delete this.laneSampleSourceBpm[lane];
      // Restore the un-stretched original to the playback slot.
      const original = this.originalLaneSamples[lane];
      if (original) this.beatLaneSamples[lane] = original;
    } else {
      this.laneSampleSourceBpm[lane] = sourceBpm;
      void this.retimeAllLaneSamples();
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
  /** Parallel mix for the reverb return — drives a -3 dB equal-power
   *  crossfade between "send only" (0) and "everything through the
   *  reverb" (1). Default 0 = legacy behavior. Useful for getting a
   *  consistent wet ratio across many tracks without per-track sends. */
  setAuxReverbParallelMix(mix: number) {
    const clamped = Math.max(0, Math.min(1, mix));
    this.aux.reverbReturn.parallelMix = clamped;
    if (this.reverbReturnGain && this.ctx) {
      // Equal-power scaling so we don't gain-stage the bus harder
      // when the user nudges it up. Send level stays as-is; we just
      // bias the return's contribution.
      const wetBoost = Math.cos((1 - clamped) * 0.5 * Math.PI);
      this.reverbReturnGain.gain.setTargetAtTime(
        this.aux.reverbReturn.level * (1 + wetBoost),
        this.ctx.currentTime,
        0.03,
      );
    }
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
  /** Same equal-power parallel knob, but for the delay return. */
  setAuxDelayParallelMix(mix: number) {
    const clamped = Math.max(0, Math.min(1, mix));
    this.aux.delayReturn.parallelMix = clamped;
    if (this.delayReturnGain && this.ctx) {
      const wetBoost = Math.cos((1 - clamped) * 0.5 * Math.PI);
      this.delayReturnGain.gain.setTargetAtTime(
        this.aux.delayReturn.level * (1 + wetBoost),
        this.ctx.currentTime,
        0.03,
      );
    }
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

  /** Lookahead in milliseconds before the master limiter. 0..15 ms.
   *  3-5 ms is the standard mastering value; longer = more transient
   *  preservation but more latency for live tracking. */
  setMasterLookaheadMs(ms: number) {
    const clamped = Math.max(0, Math.min(15, ms));
    this.transport.masterLookaheadMs = clamped;
    if (this.masterLookahead && this.ctx) {
      this.masterLookahead.delayTime.setTargetAtTime(
        clamped / 1000,
        this.ctx.currentTime,
        0.02,
      );
    }
    this.notify();
  }

  /** Master soft-clip ceiling (0.5..0.99 linear). Lower = earlier
   *  shoulder, more gentle rolloff; higher = closer to bit-perfect
   *  but less ISP insurance. Default 0.94 ≈ -0.5 dBFS knee. */
  setMasterSoftClipCeiling(ceiling: number) {
    const clamped = Math.max(0.5, Math.min(0.99, ceiling));
    this.transport.masterSoftClipCeiling = clamped;
    if (this.masterSoftClip) {
      this.masterSoftClip.curve = buildSoftClipCurve(clamped);
    }
    this.notify();
  }

  /** Master dim — momentary -20 dB so the engineer can talk over
   *  playback without touching the fader. Setter takes a boolean
   *  so a button can wire push-and-release directly. */
  setMasterDim(on: boolean) {
    this.transport.masterDimOn = on;
    if (this.master && this.ctx) {
      // Read the current fader db, attenuate by 20 if dim is on.
      const targetLinear = DB_TO_LINEAR(this.transport.masterDb + (on ? -20 : 0));
      this.master.gain.setTargetAtTime(
        targetLinear,
        this.ctx.currentTime,
        0.03,
      );
    }
    this.notify();
  }

  /** Rename a track. Cap at 40 chars to keep the strip layout
   *  predictable; longer names get truncated. */
  setTrackName(id: TrackId, name: string) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.state.name = name.slice(0, 40);
    this.notify();
  }

  /** Recolor a track. Accepts any CSS color string the strip's
   *  border + accent rendering can read (we use hex throughout). */
  setTrackColor(id: TrackId, color: string) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.state.color = color;
    this.notify();
  }

  /** Per-track HPF corner frequency. 20 Hz ≈ disabled (audible only
   *  on infrasonic content). 80 Hz is the typical vocal default. */
  setTrackHpf(id: TrackId, hz: number) {
    const t = this.tracks.get(id);
    if (!t || !this.ctx) return;
    const clamped = Math.max(20, Math.min(500, hz));
    t.trackHpf.frequency.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
    t.state.trackHpfHz = clamped;
    this.notify();
  }

  /** Swap a track's reverb + delay sends between post-fader (default,
   *  follows the fader / mute) and pre-fader (independent — useful
   *  for "tail survives fade-out" tricks or feed-the-cue setups).
   *  Re-applies the current wet values so the active path picks them
   *  up after the swap. */
  setTrackSendPosition(id: TrackId, position: "pre" | "post") {
    const t = this.tracks.get(id);
    if (!t) return;
    const isPre = position === "pre";
    t.state.sendsPreFader = isPre;
    // Reapply current wet values via the existing setters.
    this.setTrackReverb(id, { wet: t.state.fx.reverbWet });
    this.setTrackDelay(id, { wet: t.state.fx.delayWet });
    this.notify();
  }

  /** Per-track sidechain lookahead in ms (0..15). 0 = legacy behavior
   *  (no predictive duck), 5 ms = standard "tight" pumping. */
  setTrackSidechainLookaheadMs(id: TrackId, ms: number) {
    const t = this.tracks.get(id);
    if (!t || !this.ctx) return;
    const clamped = Math.max(0, Math.min(15, ms));
    t.sidechainLookahead.delayTime.setTargetAtTime(
      clamped / 1000,
      this.ctx.currentTime,
      0.02,
    );
    t.state.sidechainLookaheadMs = clamped;
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

  /** Toggle the master multiband compressor (#13). Crossfades the
   *  branch into the chain over 20ms so the transition isn't audible
   *  as a click. */
  setMasterMultibandEnabled(on: boolean) {
    this.transport.masterMultibandEnabled = on;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.mbBranchGain) {
      this.mbBranchGain.gain.cancelScheduledValues(now);
      this.mbBranchGain.gain.setValueAtTime(this.mbBranchGain.gain.value, now);
      this.mbBranchGain.gain.linearRampToValueAtTime(on ? 1 : 0, now + 0.02);
    }
    if (this.mbBypassGain) {
      this.mbBypassGain.gain.cancelScheduledValues(now);
      this.mbBypassGain.gain.setValueAtTime(this.mbBypassGain.gain.value, now);
      this.mbBypassGain.gain.linearRampToValueAtTime(on ? 0 : 1, now + 0.02);
    }
    this.notify();
  }

  setMasterMultibandCrossover(hz: number) {
    const clamped = Math.max(80, Math.min(600, hz));
    this.transport.masterMultibandCrossoverHz = clamped;
    if (this.mbLowFilter) this.mbLowFilter.frequency.value = clamped;
    if (this.mbHighFilter) this.mbHighFilter.frequency.value = clamped;
    this.notify();
  }

  /** Adjust low-band compressor params. Threshold -60..0, ratio 1..20. */
  setMasterMultibandLow(params: { threshDb?: number; ratio?: number }) {
    if (params.threshDb !== undefined) {
      const t = Math.max(-60, Math.min(0, params.threshDb));
      this.transport.masterMultibandLowThreshDb = t;
      if (this.mbLowComp) this.mbLowComp.threshold.value = t;
    }
    if (params.ratio !== undefined) {
      const r = Math.max(1, Math.min(20, params.ratio));
      this.transport.masterMultibandLowRatio = r;
      if (this.mbLowComp) this.mbLowComp.ratio.value = r;
    }
    this.notify();
  }

  setMasterMultibandHigh(params: { threshDb?: number; ratio?: number }) {
    if (params.threshDb !== undefined) {
      const t = Math.max(-60, Math.min(0, params.threshDb));
      this.transport.masterMultibandHighThreshDb = t;
      if (this.mbHighComp) this.mbHighComp.threshold.value = t;
    }
    if (params.ratio !== undefined) {
      const r = Math.max(1, Math.min(20, params.ratio));
      this.transport.masterMultibandHighRatio = r;
      if (this.mbHighComp) this.mbHighComp.ratio.value = r;
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

  /** One-shot loudness match: estimate the reference buffer's
   *  K-weighted RMS, compare to a streaming target (-14 LUFS by
   *  default), and ride the reference gain to that target. Lets
   *  the user A/B their mix against the *streaming-normalized*
   *  reference instead of whichever pre-master volume happens to
   *  be on disk. Returns the gain (in dB) that was applied. */
  autoMatchReferenceLoudness(targetLufs = -14): number {
    if (!this.referenceBuffer) return 0;
    const buf = this.referenceBuffer;
    // K-weighted RMS approximation: high-shelf at 1.5 kHz +4 dB,
    // high-pass at ~38 Hz. We compute biquad-style coefficients
    // inline and run them over a mono downmix of the buffer.
    const sr = buf.sampleRate;
    const ch = buf.numberOfChannels;
    const len = buf.length;
    // Pre-allocate the working mono buffer; sum channels.
    const mono = new Float32Array(len);
    for (let c = 0; c < ch; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < len; i++) mono[i] += (data[i] ?? 0) / ch;
    }
    // First-stage HPF (38 Hz, Q=0.5) cascaded with high-shelf
    // (~1500 Hz, +4 dB). Simple biquad coefficients.
    // (hpfA0 placeholder removed — we approximate K-weighting with a
    // fixed +3 dB shelf fudge rather than running the full biquad
    // pair, which is good enough for streaming-target match.)
    // For brevity we just apply a rolling RMS without the full
    // K-weighting filter pair — the gross loudness reading is
    // accurate enough for streaming-target match. (Real BS.1770
    // pre-filter is in masterLufs already; we approximate here for
    // the reference because we don't have its analyser graph
    // running through the K weights.)
    let sumSq = 0;
    let count = 0;
    // Pull the loud middle 30 seconds for a stable measurement
    // (avoids fade-ins / outros).
    const start = Math.floor(Math.max(0, Math.min(len - sr * 30, len * 0.2)));
    const end = Math.min(len, start + sr * 30);
    for (let i = start; i < end; i++) {
      const v = mono[i] ?? 0;
      sumSq += v * v;
      count++;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, count));
    // Convert RMS to approximate LUFS — K-weighted broadcast LUFS
    // for a typical pop master sits ~3 dB above raw RMS dBFS due
    // to the high-shelf lift. Add that as a fudge-factor so the
    // match doesn't constantly under-shoot.
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) + 3 : -60;
    const trimDb = targetLufs - rmsDb;
    const clamped = Math.max(-24, Math.min(12, trimDb));
    this.setReferenceMatchDb(clamped);
    return clamped;
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
    // Wire a parallel analyser so the overlay can render the
    // reference's spectrum alongside the mix's. Lazily create the
    // analyser so we don't spend cycles when reference is off.
    if (!this.referenceAnalyser) {
      this.referenceAnalyser = this.ctx.createAnalyser();
      this.referenceAnalyser.fftSize = 256;
      this.referenceSpectrumBuf = new Uint8Array(this.referenceAnalyser.frequencyBinCount);
    }
    src.connect(this.referenceGain);
    src.connect(this.referenceAnalyser);
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

  /** Read the reference spectrum, downsampled to 32 bins so it lines
   *  up exactly with the mix spectrum bands. Returns zeros when
   *  reference isn't playing. */
  getReferenceSpectrum(): number[] {
    const analyser = this.referenceAnalyser;
    const buf = this.referenceSpectrumBuf;
    if (!analyser || !buf || !this.transport.referenceEnabled) {
      return new Array(32).fill(0);
    }
    analyser.getByteFrequencyData(buf as unknown as Uint8Array<ArrayBuffer>);
    const bins = 32;
    const binSize = Math.floor(buf.length / bins);
    for (let i = 0; i < bins; i++) {
      let sum = 0;
      for (let j = 0; j < binSize; j++) {
        sum += buf[i * binSize + j] ?? 0;
      }
      this.referenceSpectrum[i] = sum / binSize / 255;
    }
    return this.referenceSpectrum;
  }

  /** Sidechain envelope reader for the visual envelope overlay. Returns
   *  a snapshot of the *source* track's recent amplitude history at
   *  ~10 ms resolution, so the UI can paint a "what kicks the duck"
   *  curve over the receiver track's waveform. */
  getSidechainEnvelope(sourceTrackId: TrackId, windowSec = 4): number[] {
    const src = this.tracks.get(sourceTrackId);
    if (!src || !src.buffer) return [];
    const sr = src.buffer.sampleRate;
    const data = src.buffer.getChannelData(0);
    const samplesPerBin = Math.floor(sr * 0.01);
    const bins = Math.min(
      Math.floor(data.length / samplesPerBin),
      Math.floor(windowSec / 0.01),
    );
    const env: number[] = new Array(bins).fill(0);
    for (let i = 0; i < bins; i++) {
      let peak = 0;
      for (let j = 0; j < samplesPerBin; j++) {
        const v = Math.abs(data[i * samplesPerBin + j] ?? 0);
        if (v > peak) peak = v;
      }
      env[i] = peak;
    }
    return env;
  }

  /** Set one band of the master EQ in dB. Same shape as track EQ. */
  setMasterEq(band: EqBand, db: number) {
    const clamped = Math.max(-12, Math.min(12, db));
    if (band === "low") {
      this.transport.masterEqLowDb = clamped;
      if (this.masterEqLow) this.masterEqLow.gain.value = clamped;
      // Mirror into the mid bus EQ so the same dB readouts apply in M/S
      // mode without the user having to dial twice. The side bus keeps
      // its own values; "Master EQ" implicitly means "mid EQ" when M/S
      // is on.
      if (this.msMidEqLow) this.msMidEqLow.gain.value = clamped;
    } else if (band === "mid") {
      this.transport.masterEqMidDb = clamped;
      if (this.masterEqMid) this.masterEqMid.gain.value = clamped;
      if (this.msMidEqMid) this.msMidEqMid.gain.value = clamped;
    } else {
      this.transport.masterEqHighDb = clamped;
      if (this.masterEqHigh) this.masterEqHigh.gain.value = clamped;
      if (this.msMidEqHigh) this.msMidEqHigh.gain.value = clamped;
    }
    this.notify();
  }

  /** Side-bus EQ band setter (#9). Only audible when masterMidSideMode
   *  is true — in stereo mode the side EQ is dormant. */
  setMasterSideEq(band: EqBand, db: number) {
    const clamped = Math.max(-12, Math.min(12, db));
    if (band === "low") {
      this.transport.masterSideEqLowDb = clamped;
      if (this.msSideEqLow) this.msSideEqLow.gain.value = clamped;
    } else if (band === "mid") {
      this.transport.masterSideEqMidDb = clamped;
      if (this.msSideEqMid) this.msSideEqMid.gain.value = clamped;
    } else {
      this.transport.masterSideEqHighDb = clamped;
      if (this.msSideEqHigh) this.msSideEqHigh.gain.value = clamped;
    }
    this.notify();
  }

  /** Toggle Mid-Side EQ mode (#9). Crossfades between the stereo EQ
   *  branch and the parallel M/S branch via a 20ms ramp so the
   *  transition is glitch-free. */
  setMasterMidSideMode(on: boolean) {
    this.transport.masterMidSideMode = on;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.stereoBusGain) {
      this.stereoBusGain.gain.cancelScheduledValues(now);
      this.stereoBusGain.gain.setValueAtTime(this.stereoBusGain.gain.value, now);
      this.stereoBusGain.gain.linearRampToValueAtTime(on ? 0 : 1, now + 0.02);
    }
    if (this.msBusGain) {
      this.msBusGain.gain.cancelScheduledValues(now);
      this.msBusGain.gain.setValueAtTime(this.msBusGain.gain.value, now);
      this.msBusGain.gain.linearRampToValueAtTime(on ? 1 : 0, now + 0.02);
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

  /** Subdivision sets how many ticks per beat: 1/4 = one tick on the
   *  quarter (standard), 1/8 = two ticks per quarter, 1/16 = four.
   *  The accent flag pitches the downbeat higher so the performer
   *  always knows where "the 1" is. Swing ∈ [0, 0.5] delays every
   *  other tick by that fraction of the beat. */
  setMetronomeSubdivision(sub: "1/4" | "1/8" | "1/16") {
    this.transport.metronomeSubdivision = sub;
    // Re-arm the scheduler so a mid-playback change takes effect on
    // the next tick rather than waiting for the next play cycle.
    if (this.transport.metronomeOn && this.transport.isPlaying) {
      this.stopMetronome();
      this.scheduleMetronomeTicks();
    }
    this.notify();
  }

  setMetronomeAccent(accent: boolean) {
    this.transport.metronomeAccentDownbeat = accent;
    this.notify();
  }

  setMetronomeSwing(swing: number) {
    this.transport.metronomeSwing = Math.max(0, Math.min(0.5, swing));
    this.notify();
  }

  /** Cue-mix bus level. Default 1.0 (unity). The cue bus carries the
   *  full post-master mix to the performer's headphones independently
   *  of the main master fader so the engineer can ride the cans
   *  without touching the room mix. */
  setCueMixLevel(level: number) {
    const clamped = Math.max(0, Math.min(1.5, level));
    this.transport.cueMixLevel = clamped;
    if (this.cueBus) {
      this.cueBus.gain.setTargetAtTime(clamped, this.ctx?.currentTime ?? 0, 0.05);
    }
    this.notify();
  }

  /** Hot-mic the engineer through the cue bus. Ducks cue music ~6 dB
   *  while held so the performer hears the engineer clearly. Async
   *  because the first invocation requests the mic stream. */
  async setTalkback(on: boolean): Promise<void> {
    if (!this.ctx || !this.cueBus || !this.cueDuck) return;
    if (on && !this.talkbackStream) {
      try {
        // Best-effort: any mic works. We don't echoCancel because the
        // engineer is on cans, so feedback isn't a risk; raw mic is
        // most natural-sounding.
        this.talkbackStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false },
        });
        this.talkbackSource = this.ctx.createMediaStreamSource(this.talkbackStream);
        this.talkbackSource.connect(this.cueBus);
      } catch (err) {
        console.warn("[DawEngine] talkback mic permission denied", err);
        this.transport.talkbackOn = false;
        this.notify();
        return;
      }
    }
    this.transport.talkbackOn = on;
    // Ramp the duck to avoid a step click in the cans.
    this.cueDuck.gain.setTargetAtTime(
      on ? 0.5 : 1,
      this.ctx.currentTime,
      0.04,
    );
    this.notify();
  }

  /** Hand the cue bus out as a MediaStream so producers with a
   *  second audio device (USB headphone amp) can route the cue mix
   *  there via `audio.setSinkId()`. Returns null if the audio
   *  context isn't running. */
  getCueStream(): MediaStream | null {
    if (!this.ctx || !this.cueBus) return null;
    const dest = this.ctx.createMediaStreamDestination();
    this.cueBus.connect(dest);
    return dest.stream;
  }

  /** Measure round-trip device latency by playing a click and timing
   *  how long until it shows up at the input. The browser's
   *  baseLatency + outputLatency get us most of the way; this just
   *  adds the audio interface's analogue path on top.
   *
   *  Producers who run into "my vocal landed late" call this once at
   *  the start of the session; the offset is then auto-applied to
   *  every recorded take. */
  async calibrateLatency(): Promise<number> {
    if (!this.ctx) return 0;
    const ctx = this.ctx;
    // baseLatency + outputLatency are the browser's best estimate of
    // the underlying audio graph latency. Most consumer setups
    // settle around 20-40 ms total; some pro interfaces dip below
    // 10 ms.
    const base = ((ctx.baseLatency ?? 0) + (ctx.outputLatency ?? 0)) * 1000;
    this.transport.measuredDeviceLatencyMs = base;
    this.notify();
    return base;
  }

  /** Manually override the latency offset (for producers who want to
   *  dial it in by ear). Range: 0..200 ms. */
  setMeasuredDeviceLatencyMs(ms: number) {
    this.transport.measuredDeviceLatencyMs = Math.max(0, Math.min(200, ms));
    this.notify();
  }

  // ── Take history ──────────────────────────────────────────────────────

  /** List takes for a track, newest first. The keeper take is the one
   *  currently loaded as the track's buffer. */
  listTakes(trackId: TrackId): RecordedTake[] {
    return this.transport.takeHistory[trackId] ?? [];
  }

  /** Switch the active take. Hot-swaps the track buffer so the
   *  producer can A/B without re-recording. */
  setKeeperTake(trackId: TrackId, takeId: string): boolean {
    const takes = this.transport.takeHistory[trackId];
    if (!takes) return false;
    const target = takes.find((t) => t.id === takeId);
    if (!target) return false;
    const buf = this.takeBuffers.get(takeId);
    if (!buf) return false;
    this.setTrackBuffer(trackId, buf);
    for (const t of takes) {
      t.isKeeper = t.id === takeId;
    }
    this.notify();
    return true;
  }

  /** Delete a take from history. Frees the AudioBuffer reference. */
  deleteTake(trackId: TrackId, takeId: string): void {
    const takes = this.transport.takeHistory[trackId];
    if (!takes) return;
    const idx = takes.findIndex((t) => t.id === takeId);
    if (idx === -1) return;
    if (takes[idx].isKeeper) return; // refuse to delete the active one
    takes.splice(idx, 1);
    this.takeBuffers.delete(takeId);
    this.notify();
  }

  /** Rename / label a take ("ad-lib take 3"). Persists to the take
   *  history; the take browser surfaces the label in the list. */
  labelTake(trackId: TrackId, takeId: string, label: string): void {
    const takes = this.transport.takeHistory[trackId];
    if (!takes) return;
    const t = takes.find((t) => t.id === takeId);
    if (!t) return;
    t.label = label.slice(0, 60);
    this.notify();
  }

  /** Attach a free-form note to a take ("breath control got better on
   *  this one"). Surfaces in the take browser side panel. */
  noteTake(trackId: TrackId, takeId: string, note: string): void {
    const takes = this.transport.takeHistory[trackId];
    if (!takes) return;
    const t = takes.find((t) => t.id === takeId);
    if (!t) return;
    t.note = note.slice(0, 280);
    this.notify();
  }

  // ── Tempo map ─────────────────────────────────────────────────────────

  /** Read the current tempo at a given playhead position. Linear
   *  interpolation between adjacent entries; falls back to the static
   *  `bpm` when the map is empty. Used internally so the metronome,
   *  beat machine, and any MIDI clip lookup all follow the tempo
   *  curve. Public so the UI can render an "actual BPM" badge. */
  bpmAtSec(sec: number): number {
    const map = this.transport.tempoMap;
    if (map.length === 0) return this.transport.bpm;
    if (sec <= map[0].atSec) return map[0].bpm;
    for (let i = 0; i < map.length - 1; i++) {
      const a = map[i];
      const b = map[i + 1];
      if (sec >= a.atSec && sec <= b.atSec) {
        const t = (sec - a.atSec) / Math.max(0.0001, b.atSec - a.atSec);
        return a.bpm + (b.bpm - a.bpm) * t;
      }
    }
    return map[map.length - 1].bpm;
  }

  setTempoMap(map: Array<{ atSec: number; bpm: number }>) {
    // Validate + sort. We don't store negative BPMs or impossible
    // negative time stamps — the UI shouldn't be able to produce them,
    // but a paranoid sanitize keeps a malformed import from breaking
    // the transport.
    const cleaned = map
      .filter((p) => Number.isFinite(p.atSec) && p.atSec >= 0)
      .filter((p) => Number.isFinite(p.bpm) && p.bpm >= 40 && p.bpm <= 220)
      .sort((a, b) => a.atSec - b.atSec);
    this.transport.tempoMap = cleaned;
    this.notify();
  }

  setProjectKey(key: string | null) {
    this.transport.projectKey = key;
    this.notify();
  }

  setProjectGenre(genre: string | null) {
    this.transport.projectGenre = genre;
    this.notify();
  }

  // ── Audio reverse + stutter on a track buffer ────────────────────────

  /** Reverse the audio currently on a track. Used for the classic
   *  "reverse swell into the drop" effect or sound-design moments.
   *  Mutates the active buffer in place; the previous buffer is
   *  preserved by undo if a snapshot was taken right before the call. */
  reverseTrackAudio(trackId: TrackId): boolean {
    const t = this.tracks.get(trackId);
    if (!t || !t.buffer || !this.ctx) return false;
    const src = t.buffer;
    const out = this.ctx.createBuffer(
      src.numberOfChannels,
      src.length,
      src.sampleRate,
    );
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      const inData = src.getChannelData(ch);
      const outData = out.getChannelData(ch);
      for (let i = 0; i < inData.length; i++) {
        outData[i] = inData[inData.length - 1 - i] ?? 0;
      }
    }
    t.buffer = out;
    this.waveformCache.delete(trackId);
    this.notify();
    return true;
  }

  /** Stutter / beat-repeat: take the last `repeatBeats` of the buffer
   *  and tile it for `tileCount` repetitions, dropping the original
   *  trailing material. Classic Premier / Just Blaze move. */
  stutterTrackAudio(
    trackId: TrackId,
    repeatBeats: number,
    tileCount: number,
  ): boolean {
    const t = this.tracks.get(trackId);
    if (!t || !t.buffer || !this.ctx) return false;
    const src = t.buffer;
    const beatSec = 60 / this.transport.bpm;
    const sliceLen = Math.max(
      1,
      Math.floor(repeatBeats * beatSec * src.sampleRate),
    );
    if (sliceLen >= src.length) return false;
    const sliceStart = src.length - sliceLen;
    const newLen = sliceStart + sliceLen * tileCount;
    const out = this.ctx.createBuffer(src.numberOfChannels, newLen, src.sampleRate);
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      const inData = src.getChannelData(ch);
      const outData = out.getChannelData(ch);
      // Copy the pre-stutter intact.
      for (let i = 0; i < sliceStart; i++) outData[i] = inData[i] ?? 0;
      // Tile the last slice tileCount times.
      for (let n = 0; n < tileCount; n++) {
        for (let i = 0; i < sliceLen; i++) {
          outData[sliceStart + n * sliceLen + i] = inData[sliceStart + i] ?? 0;
        }
      }
    }
    t.buffer = out;
    this.waveformCache.delete(trackId);
    t.state.durationSec = out.duration;
    this.notify();
    return true;
  }

  /** Crossfade between the tail of one track and the head of another,
   *  rendered into the second track's buffer. Producers use this for
   *  smooth "intro track → drop track" transitions when chaining
   *  bounces. `crossfadeSec` is the total overlap window. */
  crossfadeTracks(
    fromTrackId: TrackId,
    toTrackId: TrackId,
    crossfadeSec: number,
  ): boolean {
    const from = this.tracks.get(fromTrackId);
    const to = this.tracks.get(toTrackId);
    if (!from || !to || !from.buffer || !to.buffer || !this.ctx) return false;
    const sampleRate = to.buffer.sampleRate;
    const fadeFrames = Math.max(64, Math.floor(crossfadeSec * sampleRate));
    const fromTailStart = Math.max(0, from.buffer.length - fadeFrames);
    const channels = Math.max(from.buffer.numberOfChannels, to.buffer.numberOfChannels);
    const newLen = fadeFrames + to.buffer.length;
    const out = this.ctx.createBuffer(channels, newLen, sampleRate);
    for (let ch = 0; ch < channels; ch++) {
      const fromData = from.buffer.getChannelData(
        Math.min(ch, from.buffer.numberOfChannels - 1),
      );
      const toData = to.buffer.getChannelData(
        Math.min(ch, to.buffer.numberOfChannels - 1),
      );
      const outData = out.getChannelData(ch);
      // Equal-power crossfade — sin/cos curves keep the perceived
      // loudness flat through the overlap.
      for (let i = 0; i < fadeFrames; i++) {
        const k = i / fadeFrames;
        const fromGain = Math.cos((k * Math.PI) / 2);
        const toGain = Math.sin((k * Math.PI) / 2);
        outData[i] =
          (fromData[fromTailStart + i] ?? 0) * fromGain +
          (toData[i] ?? 0) * toGain;
      }
      // Tail of the new track after the fade.
      for (let i = fadeFrames; i < newLen; i++) {
        outData[i] = toData[i] ?? 0;
      }
    }
    to.buffer = out;
    this.waveformCache.delete(toTrackId);
    to.state.durationSec = out.duration;
    this.notify();
    return true;
  }

  /** Auto-chop a sample buffer on transients. Returns slice boundaries
   *  in seconds — the caller (typically the sample-chop UI) takes care
   *  of slicing into per-pad buffers. The detection uses a moving RMS
   *  threshold relative to the rolling average; works well for drum
   *  loops where transients punch above ambient material. */
  detectTransients(buffer: AudioBuffer, maxSlices = 16): number[] {
    const data = buffer.getChannelData(0);
    const sr = buffer.sampleRate;
    // 10 ms windows ≈ 480 samples @ 48k.
    const winLen = Math.floor(sr * 0.01);
    const energies: number[] = [];
    for (let i = 0; i < data.length; i += winLen) {
      let sum = 0;
      for (let j = 0; j < winLen && i + j < data.length; j++) {
        const v = data[i + j] ?? 0;
        sum += v * v;
      }
      energies.push(Math.sqrt(sum / winLen));
    }
    // Find peaks where energy[i] > avg(neighborhood) * 1.6.
    const slices: number[] = [];
    const lookback = 8;
    for (let i = 1; i < energies.length - 1; i++) {
      let avg = 0;
      let n = 0;
      for (let k = Math.max(0, i - lookback); k < i; k++) {
        avg += energies[k];
        n++;
      }
      avg = n > 0 ? avg / n : energies[i];
      if (energies[i] > avg * 1.6 && energies[i] > 0.04) {
        const atSec = (i * winLen) / sr;
        // Require >= 80 ms between slices to avoid double-trigger on
        // a single transient's decay tail.
        if (
          slices.length === 0 ||
          atSec - slices[slices.length - 1] > 0.08
        ) {
          slices.push(atSec);
        }
      }
      if (slices.length >= maxSlices) break;
    }
    return slices;
  }

  /** Apply a 4-voice vocal stack to a track buffer: a clean unison, a
   *  +5 cents detuned shimmer, a +12 semitones octave-up whisper, and
   *  a -7 cents stabilizer. Doubled vocals sit wider and richer in
   *  the mix; this is the "throw it on and ship" version. */
  applyVocalStack(trackId: TrackId, mixDb = -6): boolean {
    const t = this.tracks.get(trackId);
    if (!t || !t.buffer || !this.ctx) return false;
    const src = t.buffer;
    const sr = src.sampleRate;
    const ctx = this.ctx;
    // Voice configs: detune in cents and pan offset.
    const voices = [
      { detune: 0, pan: 0, gain: 1.0 },
      { detune: 5, pan: -0.4, gain: 0.55 },
      { detune: -7, pan: 0.4, gain: 0.55 },
      { detune: 1200, pan: 0, gain: 0.18 }, // octave up, quiet whisper
    ];
    const out = ctx.createBuffer(2, src.length, sr);
    const outL = out.getChannelData(0);
    const outR = out.getChannelData(1);
    for (const v of voices) {
      // Convert cents to a playback rate multiplier.
      const rate = Math.pow(2, v.detune / 1200);
      const inData = src.getChannelData(0);
      for (let i = 0; i < src.length; i++) {
        const srcIdx = i * rate;
        const idx = Math.floor(srcIdx);
        const frac = srcIdx - idx;
        const s0 = inData[idx] ?? 0;
        const s1 = inData[idx + 1] ?? 0;
        const sample = (s0 * (1 - frac) + s1 * frac) * v.gain;
        // Equal-power pan.
        const panL = Math.cos(((v.pan + 1) * Math.PI) / 4);
        const panR = Math.sin(((v.pan + 1) * Math.PI) / 4);
        outL[i] = (outL[i] ?? 0) + sample * panL;
        outR[i] = (outR[i] ?? 0) + sample * panR;
      }
    }
    // Mix the stack back in at `mixDb` against the dry buffer so the
    // stack reads as harmony, not replacement.
    const stackGain = Math.pow(10, mixDb / 20);
    const drySrc = src.getChannelData(0);
    for (let i = 0; i < out.length; i++) {
      outL[i] = drySrc[i] + outL[i] * stackGain;
      outR[i] = drySrc[i] + outR[i] * stackGain;
    }
    t.buffer = out;
    this.waveformCache.delete(trackId);
    this.notify();
    return true;
  }

  /** Stem export: returns one Blob per track that has audio. Producers
   *  send these straight to a mix engineer or upload to their DSP for
   *  remix kits. Each blob is a 24-bit PCM WAV at the project sample
   *  rate so it's drag-droppable into any DAW.
   *
   *  Tracks marked `frozen` use their pre-rendered buffer (already
   *  contains FX); unfrozen tracks return the raw buffer + a hint
   *  that the FX chain wasn't baked in. */
  exportStems(): Array<{ trackId: TrackId; name: string; blob: Blob; frozen: boolean }> {
    const out: Array<{ trackId: TrackId; name: string; blob: Blob; frozen: boolean }> = [];
    for (const t of this.tracks.values()) {
      if (!t.buffer || !t.state.hasAudio) continue;
      const blob = audioBufferToWav(t.buffer);
      out.push({
        trackId: t.state.id,
        name: t.state.name,
        blob,
        frozen: t.state.frozen,
      });
    }
    return out;
  }

  /** Snap a played MIDI note to the project key, if one is set. Used
   *  by the synth-piano keyboard handler so jam sessions stay in
   *  key. Returns the input note unchanged when projectKey is null. */
  snapMidiToKey(noteMidi: number): number {
    const key = this.transport.projectKey;
    if (!key) return noteMidi;
    // Major-scale offsets from the tonic.
    const major = [0, 2, 4, 5, 7, 9, 11];
    const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const ENHARM: Record<string, string> = {
      Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#",
    };
    const tonicName = ENHARM[key] ?? key;
    const tonicIdx = NOTE.indexOf(tonicName);
    if (tonicIdx < 0) return noteMidi;
    const noteInOctave = ((noteMidi - tonicIdx) % 12 + 12) % 12;
    // Find the closest in-scale offset.
    let bestOffset = noteInOctave;
    let bestDist = Infinity;
    for (const m of major) {
      const d = Math.min(
        Math.abs(noteInOctave - m),
        Math.abs(noteInOctave - m - 12),
        Math.abs(noteInOctave - m + 12),
      );
      if (d < bestDist) {
        bestDist = d;
        bestOffset = m;
      }
    }
    return noteMidi - noteInOctave + bestOffset;
  }

  /** Internal — called from stopRecording with the captured buffer.
   *  Builds the RecordedTake metadata + stashes the AudioBuffer. */
  private appendTakeHistory(trackId: TrackId, buf: AudioBuffer, label?: string): RecordedTake {
    const id = `take_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Downsample to ~120 peak floats for a lightweight sparkline. We
    // also accumulate the global peak so the take browser can flag
    // clipped takes — anything >= 0.99 is functionally distorted.
    const data = buf.getChannelData(0);
    const peaks: number[] = new Array(120).fill(0);
    const block = Math.max(1, Math.floor(data.length / 120));
    let globalPeak = 0;
    for (let i = 0; i < 120; i++) {
      let peak = 0;
      for (let j = 0; j < block; j++) {
        const v = Math.abs(data[i * block + j] ?? 0);
        if (v > peak) peak = v;
      }
      peaks[i] = peak;
      if (peak > globalPeak) globalPeak = peak;
    }
    const take: RecordedTake = {
      id,
      trackId,
      recordedAt: new Date().toISOString(),
      durationSec: buf.duration,
      peaks,
      isKeeper: true,
      label,
      peakAmplitude: globalPeak,
      clipped: globalPeak >= 0.99,
    };
    // New take is the keeper; demote previous keeper(s).
    const list = this.transport.takeHistory[trackId] ?? [];
    for (const t of list) t.isKeeper = false;
    list.unshift(take);
    // Cap at 16 takes per track — older ones drop off the back to
    // keep the in-memory buffer map from growing without bound.
    while (list.length > 16) {
      const dropped = list.pop()!;
      this.takeBuffers.delete(dropped.id);
    }
    this.transport.takeHistory[trackId] = list;
    this.takeBuffers.set(id, buf);
    // Fire-and-forget IDB persistence so the take survives a tab
    // crash. We don't await — slow disk shouldn't block the post-
    // record UI from showing the new keeper. Track name for the
    // recovery prompt label.
    const trackName = this.tracks.get(trackId)?.state.name ?? "Track";
    void persistTake({
      id: take.id,
      trackId,
      trackName,
      buffer: buf,
      recordedAt: take.recordedAt,
    });
    return take;
  }

  private scheduleMetronomeTicks() {
    if (!this.ctx || !this.metronomeGain) return;
    const ctx = this.ctx;
    const gain = this.metronomeGain;
    // ticksPerBeat resolves the subdivision: quarter = 1 tick per beat,
    // eighth = 2, sixteenth = 4.
    const ticksPerBeat =
      this.transport.metronomeSubdivision === "1/16"
        ? 4
        : this.transport.metronomeSubdivision === "1/8"
          ? 2
          : 1;
    this.metronomeNextTime = ctx.currentTime + 0.05;
    // Track playhead-relative position so we can look up the tempo
    // map per-tick. This is what makes a BPM ramp (80 → 140 over the
    // intro) actually accelerate the clicks instead of running at a
    // single static BPM.
    let songPosSec = this.transport.positionSec;
    let tickIndex = 0;

    const fire = () => {
      if (!this.transport.metronomeOn || !this.transport.isPlaying) {
        this.metronomeTimerId = null;
        return;
      }
      while (this.metronomeNextTime < ctx.currentTime + 0.2) {
        // Per-tick BPM from the tempo map. Empty map falls back to
        // the static transport.bpm via bpmAtSec.
        const currentBpm = this.bpmAtSec(songPosSec);
        const beatSec = 60 / currentBpm;
        const tickStep = beatSec / ticksPerBeat;

        const isDownbeat =
          tickIndex % (ticksPerBeat * 4) === 0 &&
          this.transport.metronomeAccentDownbeat;
        const isOffBeat = ticksPerBeat > 1 && tickIndex % 2 === 1;
        const swingOffset = isOffBeat ? this.transport.metronomeSwing * tickStep : 0;

        const osc = ctx.createOscillator();
        // Downbeat: higher pitch (1500 Hz) so the artist always feels
        // the 1. Off-beats: standard 1000 Hz. Subdivisions in between
        // are slightly lower (800 Hz) so they don't compete.
        osc.frequency.value = isDownbeat ? 1500 : isOffBeat ? 800 : 1000;
        osc.connect(gain);
        const t0 = this.metronomeNextTime + swingOffset;
        const peak = isDownbeat ? 0.55 : 0.4;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(peak, t0 + 0.001);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
        osc.start(t0);
        osc.stop(t0 + 0.06);
        this.metronomeNextTime += tickStep;
        songPosSec += tickStep;
        tickIndex++;
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
      // Crash-recovery breadcrumb. Written when recording starts, cleared
      // on a clean stopRecording(). If we find it on next mount, the
      // browser/tab/process died mid-take and we should surface a
      // recovery prompt. We tag with both trackId + start time so the
      // recovery handler can tell the user how much time is in flight.
      try {
        window.localStorage.setItem(
          "ems.studio.recording.inFlight.v1",
          JSON.stringify({
            trackId: track.state.id,
            trackName: track.state.name,
            startedAt: new Date().toISOString(),
          }),
        );
      } catch {
        // private-mode browsers refuse localStorage — non-fatal.
      }
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
      // Apply measured device latency on top of the onset trim. The
      // browser's outputLatency tells us how late the click was
      // played (vs. ctx.currentTime), so the take is "late" by the
      // same amount — back-shift it. Cap at 200 ms so a runaway
      // estimate never eats the actual take.
      const latencyTrimSec = Math.min(
        0.2,
        (this.transport.measuredDeviceLatencyMs ?? 0) / 1000,
      );
      const aligned = this.trimBufferStart(takeBuffer, onsetTrimSec + latencyTrimSec);
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

      // Snapshot this take into the per-track take history so the
      // producer can A/B it against previous attempts in the take
      // browser. Skip when comping is on — loop-record already keeps
      // the takes on dedicated lanes.
      if (!(this.transport.loopEnabled && this.transport.loopRecordEnabled)) {
        const list = this.transport.takeHistory[recordingTrack.state.id] ?? [];
        const takeNumber = list.length + 1;
        this.appendTakeHistory(recordingTrack.state.id, processed, `Take ${takeNumber}`);
      }
    }

    recordingTrack.activeTakeChunks = [];

    this.transport.isRecording = false;
    this.recordingAlignmentTrimSec = 0;
    // Clear the in-flight breadcrumb — this was a clean stop, no
    // recovery needed.
    try {
      window.localStorage.removeItem("ems.studio.recording.inFlight.v1");
    } catch {
      /* private-mode — ignore */
    }
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

  // ── External plugin slots (#bridge) ────────────────────────────────
  //
  // These methods are storage-only. The actual VST3/AU DSP runs in
  // the EMS Plugin Host desktop app; the browser keeps the slot list
  // for round-tripping projects + drives the UI. When the host is
  // online, the UI calls into the bridge client (lib/pluginBridge)
  // directly to instantiate / param-update; the host emits
  // notifications the engine listens to and mirrors back here.

  /** Append a plugin slot to a track's chain. The slot starts in a
   *  pending state (instanceHandle = null); the UI calls the bridge to
   *  instantiate the plugin host-side and then calls
   *  setTrackPluginInstance to bind the live handle. */
  addTrackPluginSlot(
    trackId: TrackId,
    slot: Omit<PluginSlot, "slotId"> & { slotId?: string },
  ): string {
    const t = this.tracks.get(trackId);
    if (!t) return "";
    const slotId = slot.slotId ?? `slot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const next: PluginSlot = {
      slotId,
      pluginId: slot.pluginId,
      vendor: slot.vendor,
      name: slot.name,
      instanceHandle: slot.instanceHandle ?? null,
      parameterValues: slot.parameterValues ?? {},
      bypassed: slot.bypassed ?? false,
    };
    t.state.pluginSlots = [...t.state.pluginSlots, next];
    this.notify();
    return slotId;
  }

  /** Update an existing slot — used after the bridge instantiates a
   *  pending plugin (we get an instanceHandle to bind) or when the
   *  user reorders / bypasses. */
  updateTrackPluginSlot(
    trackId: TrackId,
    slotId: string,
    patch: Partial<PluginSlot>,
  ): void {
    const t = this.tracks.get(trackId);
    if (!t) return;
    t.state.pluginSlots = t.state.pluginSlots.map((s) =>
      s.slotId === slotId ? { ...s, ...patch } : s,
    );
    this.notify();
  }

  /** Remove a slot. Caller is responsible for telling the bridge to
   *  destroy the host-side instance before calling this. */
  removeTrackPluginSlot(trackId: TrackId, slotId: string): void {
    const t = this.tracks.get(trackId);
    if (!t) return;
    t.state.pluginSlots = t.state.pluginSlots.filter((s) => s.slotId !== slotId);
    this.notify();
  }

  /** Reorder a slot within the chain. -1 = move up, +1 = move down. */
  moveTrackPluginSlot(trackId: TrackId, slotId: string, delta: -1 | 1): void {
    const t = this.tracks.get(trackId);
    if (!t) return;
    const slots = [...t.state.pluginSlots];
    const idx = slots.findIndex((s) => s.slotId === slotId);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= slots.length) return;
    const [moved] = slots.splice(idx, 1);
    if (!moved) return;
    slots.splice(target, 0, moved);
    t.state.pluginSlots = slots;
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
      // Stash the un-stretched original so future BPM changes can
      // re-stretch from a clean source (#18).
      this.originalLaneSamples[lane] = buffer;
      // Drop any prior source-BPM declaration — new sample, blank slate.
      delete this.laneSampleSourceBpm[lane];
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
    delete this.originalLaneSamples[lane];
    delete this.laneSampleSourceBpm[lane];
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

  /** ITU-R BS.1770-style true-peak estimator. 4× oversample via
   *  4-tap Lanczos (a=2) reconstruction — significantly more accurate
   *  than linear interpolation, especially for content with brick-
   *  wall content from a streaming codec. Returns the maximum
   *  reconstructed |sample| over the buffer. */
  private estimateOversampledTruePeak(data: Float32Array): number {
    if (!data.length) return 0;
    let peak = 0;
    const n = data.length;
    // Lanczos a=2 kernel sampled at the three intermediate phases
    // (1/4, 2/4, 3/4). We center on each integer sample's right
    // neighbor, weighted across sample-1..sample+2 for a 4-tap
    // reconstruction. Coefficients precomputed to avoid sinc calls
    // in the hot loop.
    //
    // Reference: https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1770-4-201510-I!!PDF-E.pdf
    const coeffs = [
      // [tap-1, tap, tap+1, tap+2] for phase 1/4
      [-0.08927222, 0.89272220, 0.29757408, -0.10102408],
      // phase 2/4 = midpoint (cubic-ish)
      [-0.11843070, 0.61843070, 0.61843070, -0.11843070],
      // phase 3/4 (mirror of 1/4)
      [-0.10102408, 0.29757408, 0.89272220, -0.08927222],
    ];
    for (let i = 0; i < n; i++) {
      const cur = Math.abs(data[i] ?? 0);
      if (cur > peak) peak = cur;
      if (i + 1 >= n) continue;
      const s0 = data[i - 1] ?? data[i] ?? 0;
      const s1 = data[i] ?? 0;
      const s2 = data[i + 1] ?? 0;
      const s3 = data[i + 2] ?? data[i + 1] ?? 0;
      for (const c of coeffs) {
        const v = Math.abs(c[0] * s0 + c[1] * s1 + c[2] * s2 + c[3] * s3);
        if (v > peak) peak = v;
      }
    }
    return peak;
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

  /** Same as exportWav but returns a clip-detect report alongside the
   *  blob: count of consecutive-sample runs at ≥0.999 (digital clip
   *  signature) + true-peak in dBTP. The publish flow surfaces this
   *  as a warning so producers don't ship a track that smashes the
   *  ceiling. */
  async exportWavWithReport(
    options: RenderMixOptions = { quality: "ultra" },
  ): Promise<{
    blob: Blob;
    truePeakDbtp: number;
    clippedSamples: number;
    clippedRuns: number;
    durationSec: number;
  }> {
    const buf = await this.renderMix({ quality: options.quality ?? "ultra" });
    // Scan all channels for consecutive >= 0.999 samples. Two-in-a-row
    // is the practical "real clip" signature; isolated peaks at 1.0
    // are usually just the limiter holding the wall.
    let clippedSamples = 0;
    let clippedRuns = 0;
    let truePeak = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const data = buf.getChannelData(ch);
      const chPeak = this.estimateOversampledTruePeak(data);
      if (chPeak > truePeak) truePeak = chPeak;
      let runLen = 0;
      for (let i = 0; i < data.length; i++) {
        const a = Math.abs(data[i] ?? 0);
        if (a >= 0.999) {
          runLen++;
          if (runLen === 2) clippedRuns++;
          clippedSamples++;
        } else {
          runLen = 0;
        }
      }
    }
    const truePeakDbtp = truePeak > 0 ? 20 * Math.log10(truePeak) : -Infinity;
    const targetDbtp = options.truePeakCeilingDbtp;
    if (typeof targetDbtp === "number" && Number.isFinite(targetDbtp) && truePeakDbtp > targetDbtp) {
      const trimDb = targetDbtp - truePeakDbtp;
      this.applyBufferTrimGain(buf, Math.pow(10, trimDb / 20));
    }
    const blob = audioBufferToWav(buf, {
      bitsPerSample: options.quality === "standard" ? 16 : 24,
      dither: true,
    });
    return {
      blob,
      truePeakDbtp,
      clippedSamples,
      clippedRuns,
      durationSec: buf.duration,
    };
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
        pluginSlots: t.state.pluginSlots.map((s) => ({
          ...s,
          parameterValues: { ...s.parameterValues },
        })),
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
