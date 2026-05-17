import type { DrumKind, DrumKitId } from "@/components/daw/beatMachine";
import type { useStudioMidiBridge } from "./useStudioMidiBridge";

export type StudioMode = "studio" | "edit" | "mix" | "beat" | "collab" | "export";
export type StudioTrackKind = "audio" | "instrument" | "midi" | "drum" | "melody" | "bass" | "vocal" | "fx";

export type WaveformPeaks = {
  peaks: number[];
  durationSec: number;
  sampleRate?: number;
};

export type StudioAudioBufferRef = {
  id: string;
  name: string;
  durationSec: number;
  sampleRate?: number;
  channelCount?: number;
  peaks: WaveformPeaks;
  source: "import" | "recording" | "generated" | "placeholder";
  createdAt: string;
};

export type StudioClip = {
  id: string;
  trackId: string;
  name: string;
  startSec: number;
  durationSec: number;
  offsetSec: number;
  color?: string;
  waveform: WaveformPeaks;
  audioBufferId?: string;
  audioUrl?: string;
  soundAssetId?: string;
  muted?: boolean;
  selected?: boolean;
  fadeInSec?: number;
  fadeOutSec?: number;
  source: "import" | "recording" | "generated" | "placeholder";
};

export type StudioSoundCategory = "drums" | "808" | "keys" | "synth" | "guitar" | "strings" | "brass" | "fx" | "melody" | "misc";

export type StudioSoundAsset = {
  id: string;
  name: string;
  url: string;
  source: "upload" | "factory" | "generated";
  kit?: DrumKitId;
  instrument?: string;
  category?: StudioSoundCategory;
  key?: string;
  bpm?: number;
  size?: number;
  durationSec?: number;
  createdAt: string;
};

export type StudioTrack = {
  id: string;
  name: string;
  kind: StudioTrackKind;
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  meter: number;
  height?: number;
  collapsed?: boolean;
  waveform?: WaveformPeaks;
  soundKit?: DrumKitId;
  instrumentPreset?: string;
  customSoundUrl?: string;
  sampleName?: string;
};

export type StudioTrackRuntime = StudioTrack & {
  index: number;
  effectiveHeight: number;
  isSelected: boolean;
  clips: StudioClip[];
};

export type StudioRuntimeState = {
  playing: boolean;
  positionSec: number;
  bpm: number;
  bars: number;
  beats: number;
  zoom: number;
  pixelsPerSecond: number;
  tracks: StudioTrackRuntime[];
  clips: StudioClip[];
  audioBuffers: StudioAudioBufferRef[];
  selectedTrackId: string | null;
  selectedClipId: string | null;
};

export type StudioPad = { label: string; kind: DrumKind; color: string; soundUrl?: string; soundName?: string };
export type StudioMidiBridge = ReturnType<typeof useStudioMidiBridge>;
