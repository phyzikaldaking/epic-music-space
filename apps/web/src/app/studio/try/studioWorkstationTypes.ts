import type { DrumKind } from "@/components/daw/beatMachine";
import type { useStudioMidiBridge } from "./useStudioMidiBridge";

export type StudioMode = "studio" | "edit" | "mix" | "beat" | "collab" | "export";
export type StudioTrackKind = "audio" | "drum" | "melody" | "bass" | "vocal" | "fx";
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
};
export type StudioPad = { label: string; kind: DrumKind; color: string };
export type StudioMidiBridge = ReturnType<typeof useStudioMidiBridge>;
