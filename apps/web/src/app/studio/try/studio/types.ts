export type StudioMode = "edit" | "mix" | "beat" | "export" | "files";
export type StudioTool = "smart" | "selector" | "grabber" | "trim" | "pencil" | "scrubber" | "zoomer";
export type StudioEditMode = "slip" | "grid" | "spot" | "shuffle";

export type StudioClip = {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  duration: number;
  peaks: number[];
  start: number;
  trimStart: number;
  trimEnd: number;
  fadeIn: number;
  fadeOut: number;
  gain: number;
  muted: boolean;
  locked: boolean;
  missing?: boolean;
  color?: string;
};

export type StudioTrack = {
  id: string;
  name: string;
  color: string;
  armed: boolean;
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  inputGain: number;
  clips: StudioClip[];
};

export type StudioSnapshot = {
  id: string;
  label: string;
  createdAt: string;
  tracks: StudioTrack[];
};

export type StudioSavedSession = {
  id: string;
  title: string;
  bpm: number;
  sampleRate: number;
  updatedAt: string;
  tracks: StudioTrack[];
  snapshots: StudioSnapshot[];
};

export type StudioHistoryEntry = {
  label: string;
  tracks: StudioTrack[];
};

export type StudioApiTrack = {
  id?: string;
  name: string;
  color: string;
  blobUrl?: string | null;
  durationSec: number;
  position: number;
};

export type StudioApiProject = {
  id: string;
  name: string;
  bpm: number;
  updatedAt: string;
  tracks?: StudioApiTrack[];
  patternJson?: unknown;
  thumbnailPeaks?: number[] | null;
};

export type StudioRecentProject = {
  id: string;
  title: string;
  updatedAt: string;
};
