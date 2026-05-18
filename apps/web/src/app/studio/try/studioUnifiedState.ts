export type StudioWorkspace = "production" | "beat";
export type StudioRole = "viewer" | "commenter" | "editor" | "engineer" | "owner";
export type StudioTrackKind = "audio" | "aux" | "master";
export type StudioExportType = "MP3 Demo" | "WAV Master" | "Stems" | "Social Preview" | "Archive Bundle";
export type StudioExportStatus = "idle" | "queued" | "rendering" | "complete" | "failed";
export type StudioEditMode = "slip" | "grid" | "shuffle" | "spot";
export type StudioRulerMode = "bars" | "minutes" | "samples" | "timecode";
export type StudioEditCommand = "separate" | "heal" | "duplicate" | "consolidate" | "trim-selection" | "clear" | "batch-gain" | "group";

export type StudioClip = {
  id: string;
  name: string;
  trackId: string;
  start: number;
  duration: number;
  gainDb: number;
  fadeIn: number;
  fadeOut: number;
  grouped: boolean;
  consolidated: boolean;
  audioFileId?: string;
  storagePath?: string;
  synced: boolean;
  missing: boolean;
};

export type StudioMarker = {
  id: string;
  name: string;
  position: number;
  color: string;
};

export type StudioMemoryLocation = {
  id: string;
  name: string;
  start: number;
  end: number;
};

export type StudioEditHistoryEntry = {
  id: string;
  label: string;
  createdAt: string;
};

export type StudioTimelineState = {
  mode: StudioEditMode;
  ruler: StudioRulerMode;
  snapEnabled: boolean;
  gridSubdivision: "1 bar" | "1/2" | "1/4" | "1/8" | "1/16" | "samples";
  nudgeValue: number;
  selectionStart: number;
  selectionEnd: number;
  selectedClipIds: string[];
  commandMenuOpen: boolean;
  commandSearch: string;
  markers: StudioMarker[];
  memoryLocations: StudioMemoryLocation[];
  undo: StudioEditHistoryEntry[];
  redo: StudioEditHistoryEntry[];
};

export type StudioTrack = {
  id: string;
  name: string;
  kind: StudioTrackKind;
  color: string;
  armed: boolean;
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  route: string;
};

export type StudioSession = {
  id: string | null;
  title: string;
  bpm: number;
  sampleRate: number;
  dirty: boolean;
  savedAt: string | null;
  cloudSynced: boolean;
};

export type StudioExportJob = {
  id: string;
  type: StudioExportType;
  status: StudioExportStatus;
  detail: string;
};

export type StudioCollaborator = {
  id: string;
  email: string;
  role: StudioRole;
  status: "active" | "invited";
};

export type StudioState = {
  session: StudioSession;
  workspace: StudioWorkspace;
  tracks: StudioTrack[];
  clips: StudioClip[];
  exports: StudioExportJob[];
  collaborators: StudioCollaborator[];
  activePanel: "overview" | "edit" | "mix" | "cloud" | "ai" | "export" | "collab" | "tests";
  editorLock: { locked: boolean; owner: string | null };
  timeline: StudioTimelineState;
};

export const initialStudioState: StudioState = {
  session: {
    id: null,
    title: "Untitled Studio Session",
    bpm: 120,
    sampleRate: 48000,
    dirty: false,
    savedAt: null,
    cloudSynced: false,
  },
  workspace: "production",
  activePanel: "overview",
  tracks: [
    { id: "track-vocal", name: "Vocal", kind: "audio", color: "#65d6ff", armed: true, muted: false, solo: false, volume: 82, pan: 0, route: "Vocal Aux" },
    { id: "track-music", name: "Music", kind: "audio", color: "#f9d66a", armed: false, muted: false, solo: false, volume: 76, pan: 0, route: "Bus 1" },
    { id: "track-fx", name: "FX Return", kind: "aux", color: "#ff7adf", armed: false, solo: false, muted: false, volume: 70, pan: 0, route: "Main" },
    { id: "track-master", name: "Master", kind: "master", color: "#d8d2bd", armed: false, muted: false, solo: false, volume: 86, pan: 0, route: "Main" },
  ],
  clips: [],
  exports: [],
  collaborators: [
    { id: "owner", email: "phyzikaldaking@gmail.com", role: "owner", status: "active" },
  ],
  editorLock: { locked: false, owner: null },
  timeline: {
    mode: "grid",
    ruler: "bars",
    snapEnabled: true,
    gridSubdivision: "1/4",
    nudgeValue: 0.25,
    selectionStart: 0,
    selectionEnd: 4,
    selectedClipIds: [],
    commandMenuOpen: false,
    commandSearch: "",
    markers: [
      { id: "marker-intro", name: "Intro", position: 0, color: "#65d6ff" },
      { id: "marker-hook", name: "Hook", position: 16, color: "#f9d66a" },
    ],
    memoryLocations: [
      { id: "memory-hook", name: "Hook Loop", start: 16, end: 32 },
    ],
    undo: [],
    redo: [],
  },
};

export function studioNowLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function studioUid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
