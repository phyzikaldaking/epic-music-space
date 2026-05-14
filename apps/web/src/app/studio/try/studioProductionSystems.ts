import type { CrdtOperation, DeviceQaResult, StudioArrangement } from "./studioDawTypes";

export type AudioRealismConfig = {
  synth: "subtractive" | "fm" | "wavetable";
  convolutionReverbImpulse?: string;
  pitchCorrection: { enabled: boolean; scale: "minor" | "major" | "chromatic"; strength: number };
  timestretch: { enabled: boolean; mode: "preview" | "quality"; ratio: number };
  mastering: { limiter: boolean; glueCompressor: boolean; stereoWidth: number; ceilingDb: number };
};

export type ScalabilityPlan = {
  maxVisibleTracks: number;
  virtualizeClips: boolean;
  workerPools: Array<"sequencer" | "waveform" | "export" | "crdt">;
  incrementalRenderWindowBeats: number;
  offlineCacheKeys: string[];
};

export type AutosaveJournalEntry<T = unknown> = {
  id: string;
  projectId: string;
  createdAt: string;
  revision: number;
  checksum: string;
  payload: T;
};

export type CollaborationAuthority = {
  sessionId: string;
  leaderId: string;
  laneLocks: Record<string, { actorId: string; expiresAt: string }>;
  pendingMerges: CrdtOperation[];
};

export const DEFAULT_AUDIO_REALISM: AudioRealismConfig = {
  synth: "subtractive",
  pitchCorrection: { enabled: false, scale: "minor", strength: 0.65 },
  timestretch: { enabled: false, mode: "preview", ratio: 1 },
  mastering: { limiter: true, glueCompressor: true, stereoWidth: 0.18, ceilingDb: -1 },
};

export const DEFAULT_SCALABILITY_PLAN: ScalabilityPlan = {
  maxVisibleTracks: 80,
  virtualizeClips: true,
  workerPools: ["sequencer", "waveform", "export", "crdt"],
  incrementalRenderWindowBeats: 128,
  offlineCacheKeys: ["project-snapshots", "waveform-peaks", "export-artifacts", "sample-cache"],
};

export const DEVICE_QA_MATRIX: DeviceQaResult[] = [
  { id: "safari-ios-audio", browser: "Safari", device: "iPhone/iPad", feature: "audio", status: "warn", notes: "Validate user-gesture AudioContext unlock, suspended context resume, and output latency." },
  { id: "chrome-android-transport", browser: "Chrome", device: "Android", feature: "transport", status: "warn", notes: "Validate scrolling during playback, RAF timing, and background tab behavior." },
  { id: "firefox-midi", browser: "Firefox", device: "Desktop", feature: "midi", status: "warn", notes: "Web MIDI support varies; show unavailable guard and preserve piano-roll workflows." },
  { id: "safari-export", browser: "Safari", device: "macOS/iOS", feature: "export", status: "warn", notes: "Validate OfflineAudioContext, Blob download, and artifact API behavior." },
  { id: "edge-collab", browser: "Edge", device: "Windows", feature: "collab", status: "warn", notes: "Validate realtime reconnects, lane locks, and conflict messages." },
];

export function checksumSnapshot(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) | 0;
  return Math.abs(hash).toString(16);
}

export function createAutosaveJournalEntry<T>(projectId: string, revision: number, payload: T): AutosaveJournalEntry<T> {
  return { id: `journal-${Date.now()}-${revision}`, projectId, createdAt: new Date().toISOString(), revision, checksum: checksumSnapshot(payload), payload };
}

export function validateJournalEntry(entry: AutosaveJournalEntry) {
  return entry.checksum === checksumSnapshot(entry.payload);
}

export function mergeCrdtOperations(base: CrdtOperation[], incoming: CrdtOperation[]) {
  const byId = new Map<string, CrdtOperation>();
  [...base, ...incoming].sort((a, b) => a.clock - b.clock || a.actorId.localeCompare(b.actorId)).forEach((op) => byId.set(op.id, op));
  return Array.from(byId.values());
}

export function getVisibleArrangementWindow(arrangement: StudioArrangement, startBeat: number, endBeat: number) {
  return arrangement.clips.filter((clip) => clip.startBeat < endBeat && clip.startBeat + clip.lengthBeats > startBeat);
}
