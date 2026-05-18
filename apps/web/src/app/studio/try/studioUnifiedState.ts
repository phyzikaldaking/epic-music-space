export type StudioWorkspace = "production" | "beat";
export type StudioRole = "viewer" | "commenter" | "editor" | "engineer" | "owner";
export type StudioTrackKind = "audio" | "aux" | "master";
export type StudioExportType = "MP3 Demo" | "WAV Master" | "Stems" | "Social Preview" | "Archive Bundle";
export type StudioExportStatus = "idle" | "queued" | "rendering" | "complete" | "failed";

export type StudioClip = {
  id: string;
  name: string;
  trackId: string;
  start: number;
  duration: number;
  audioFileId?: string;
  storagePath?: string;
  synced: boolean;
  missing: boolean;
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
    { id: "track-fx", name: "FX Return", kind: "aux", color: "#ff7adf", armed: false, muted: false, solo: false, volume: 70, pan: 0, route: "Main" },
    { id: "track-master", name: "Master", kind: "master", color: "#d8d2bd", armed: false, muted: false, solo: false, volume: 86, pan: 0, route: "Main" },
  ],
  clips: [],
  exports: [],
  collaborators: [
    { id: "owner", email: "phyzikaldaking@gmail.com", role: "owner", status: "active" },
  ],
  editorLock: { locked: false, owner: null },
};

export function studioNowLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function studioUid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
