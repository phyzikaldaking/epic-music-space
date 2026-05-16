import type { DrumKind } from "@/components/daw/beatMachine";
import type { useStudioMidiBridge } from "./useStudioMidiBridge";

export type StudioMode = "studio" | "edit" | "mix" | "beat" | "collab" | "export";
export type StudioTrackKind = "audio" | "instrument" | "midi" | "drum" | "melody" | "bass" | "vocal" | "fx";

export type WaveformPeaks = {
  peaks: number[];
  durationSec: number;
  sampleRate?: number;
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
};

export type StudioTrackRuntime = StudioTrack & {
  index: number;
  effectiveHeight: number;
  isSelected: boolean;
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
  selectedTrackId: string | null;
};

export type StudioPad = { label: string; kind: DrumKind; color: string };
export type StudioMidiBridge = ReturnType<typeof useStudioMidiBridge>;
