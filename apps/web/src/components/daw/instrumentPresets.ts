import type { MidiSynthState, SynthWave } from "./dawEngine";

export type InstrumentPresetId =
  | "grand_keys"
  | "trap_lead"
  | "warm_pad"
  | "808_slide"
  | "pluck"
  | "bass_synth"
  | "bell"
  | "organ";

export type InstrumentPreset = {
  id: InstrumentPresetId;
  name: string;
  family: "Keys" | "Lead" | "Pad" | "Bass" | "Pluck";
  description: string;
  shortcut: string;
  patch: Pick<MidiSynthState, "wave" | "attackSec" | "releaseSec" | "filterHz" | "glideSec" | "filterVelocityModHz">;
};

export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  {
    id: "grand_keys",
    name: "Grand Keys",
    family: "Keys",
    description: "Clean piano-style starter patch for writing chords and melodies.",
    shortcut: "5",
    patch: { wave: "triangle" as SynthWave, attackSec: 0.012, releaseSec: 0.42, filterHz: 6200, glideSec: 0, filterVelocityModHz: 1400 },
  },
  {
    id: "trap_lead",
    name: "Trap Lead",
    family: "Lead",
    description: "Bright lead sound for melodies that cut through hard drums.",
    shortcut: "6",
    patch: { wave: "sawtooth" as SynthWave, attackSec: 0.004, releaseSec: 0.22, filterHz: 7600, glideSec: 0.04, filterVelocityModHz: 2200 },
  },
  {
    id: "warm_pad",
    name: "Warm Pad",
    family: "Pad",
    description: "Slow atmospheric sound for chords, hooks, intros, and transitions.",
    shortcut: "7",
    patch: { wave: "sine" as SynthWave, attackSec: 0.35, releaseSec: 1.6, filterHz: 3800, glideSec: 0.08, filterVelocityModHz: 900 },
  },
  {
    id: "808_slide",
    name: "808 Slide",
    family: "Bass",
    description: "Gliding low-end patch for sketching basslines before committing samples.",
    shortcut: "8",
    patch: { wave: "sine" as SynthWave, attackSec: 0.002, releaseSec: 0.7, filterHz: 900, glideSec: 0.18, filterVelocityModHz: 250 },
  },
  {
    id: "pluck",
    name: "Pluck",
    family: "Pluck",
    description: "Short, fast melody patch for counter-melodies and bounce ideas.",
    shortcut: "9",
    patch: { wave: "square" as SynthWave, attackSec: 0.003, releaseSec: 0.16, filterHz: 5400, glideSec: 0, filterVelocityModHz: 1800 },
  },
  {
    id: "bass_synth",
    name: "Bass Synth",
    family: "Bass",
    description: "Controlled bass synth for sub lines and darker melodic support.",
    shortcut: "0",
    patch: { wave: "triangle" as SynthWave, attackSec: 0.006, releaseSec: 0.55, filterHz: 1300, glideSec: 0.08, filterVelocityModHz: 500 },
  },
  {
    id: "bell",
    name: "Bell",
    family: "Keys",
    description: "Light bell-style tone for hooks, intros, and high melody layers.",
    shortcut: "-",
    patch: { wave: "sine" as SynthWave, attackSec: 0.002, releaseSec: 1.2, filterHz: 9200, glideSec: 0, filterVelocityModHz: 3200 },
  },
  {
    id: "organ",
    name: "Organ",
    family: "Keys",
    description: "Sustained square-wave organ flavor for gospel, soul, and trap progressions.",
    shortcut: "=",
    patch: { wave: "square" as SynthWave, attackSec: 0.02, releaseSec: 0.35, filterHz: 4800, glideSec: 0.02, filterVelocityModHz: 700 },
  },
];

export function applyInstrumentPreset(
  preset: InstrumentPreset,
  onSetParam: <K extends keyof MidiSynthState>(key: K, value: MidiSynthState[K]) => void,
): void {
  (Object.entries(preset.patch) as Array<[keyof typeof preset.patch, (typeof preset.patch)[keyof typeof preset.patch]]>).forEach(([key, value]) => {
    onSetParam(key as keyof MidiSynthState, value as MidiSynthState[keyof MidiSynthState]);
  });
}

export function findInstrumentPresetByShortcut(key: string): InstrumentPreset | undefined {
  return INSTRUMENT_PRESETS.find((preset) => preset.shortcut === key);
}
