import type { AutomationPoint, MidiNoteEvent } from "./studioAudioEngine";

export type StudioClip = {
  id: string;
  trackId: string;
  name: string;
  startBeat: number;
  lengthBeats: number;
  color: string;
  type: "audio" | "midi" | "beat" | "automation";
  muted?: boolean;
};

export type StudioArrangement = {
  clips: StudioClip[];
  zoom: number;
  snapBeats: number;
};

export type AutomationLane = {
  id: string;
  trackId: string;
  target: "gain" | "pan" | "filter" | "send";
  points: AutomationPoint[];
};

export type MidiTake = {
  id: string;
  trackId: string;
  notes: MidiNoteEvent[];
  createdAt: string;
};

export type CrdtOperation = {
  id: string;
  actorId: string;
  clock: number;
  entity: "clip" | "automation" | "track" | "midi";
  action: "insert" | "update" | "delete";
  targetId: string;
  payload: unknown;
};

export type DeviceQaResult = {
  id: string;
  browser: string;
  device: string;
  feature: "audio" | "midi" | "scroll" | "transport" | "export" | "collab";
  status: "pass" | "warn" | "fail";
  notes: string;
};
