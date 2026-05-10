import type { BeatPattern, DrumKitId } from "./beatMachine";
import { emptyPattern } from "./beatMachine";

// Built-in scaffolds for the TemplatePicker (#21). Each entry seeds the
// engine with a BPM, kit choice, and a starter pattern that lands the
// genre's "this sounds like the thing" sound on first play. New session
// flow opens these from the project menu so a producer isn't staring at
// an empty grid.

export interface StudioTemplate {
  id: string;
  label: string;
  description: string;
  bpm: number;
  kit: DrumKitId;
  pattern: BeatPattern;
  genre: "boom-bap" | "trap" | "drill" | "pop" | "house" | "lofi";
  /** Optional emoji or letter shown on the template tile. */
  badge: string;
}

function boomBapPattern(): BeatPattern {
  const p = emptyPattern();
  // Classic 90 BPM — kick on 1 & 9, snare on 5 & 13, hat on every 8th.
  [0, 8].forEach((i) => (p.kick[i] = true));
  [4, 12].forEach((i) => (p.snare[i] = true));
  [0, 2, 4, 6, 8, 10, 12, 14].forEach((i) => (p.hat[i] = true));
  return p;
}

function trapPattern(): BeatPattern {
  const p = emptyPattern();
  // 140 BPM trap — kick syncopation, rolling hats with one 16th, 808s
  // following the kick. Plays well even before the user touches it.
  [0, 6, 10].forEach((i) => (p.kick[i] = true));
  [4, 12].forEach((i) => (p.snare[i] = true));
  [4, 12].forEach((i) => (p.clap[i] = true));
  [0, 2, 4, 6, 8, 10, 11, 12, 14].forEach((i) => (p.hat[i] = true));
  [7].forEach((i) => (p.openHat[i] = true));
  [0, 6, 10].forEach((i) => (p.bass808[i] = true));
  return p;
}

function drillPattern(): BeatPattern {
  const p = emptyPattern();
  // 145 BPM drill — sliding 808 and snappy hats on a 1+e+a feel.
  [0, 7, 10].forEach((i) => (p.kick[i] = true));
  [4, 12].forEach((i) => (p.snare[i] = true));
  [0, 2, 3, 4, 6, 8, 10, 12, 14, 15].forEach((i) => (p.hat[i] = true));
  [11].forEach((i) => (p.openHat[i] = true));
  [0, 7, 10].forEach((i) => (p.bass808[i] = true));
  return p;
}

function popPattern(): BeatPattern {
  const p = emptyPattern();
  // 110 BPM pop — straight four-on-the-floor with hats on the off-beats.
  [0, 4, 8, 12].forEach((i) => (p.kick[i] = true));
  [4, 12].forEach((i) => (p.snare[i] = true));
  [2, 6, 10, 14].forEach((i) => (p.hat[i] = true));
  [4, 12].forEach((i) => (p.clap[i] = true));
  return p;
}

function housePattern(): BeatPattern {
  const p = emptyPattern();
  // 124 BPM house — kick on every 4 (four on the floor), open-hat on the
  // upbeats, clap on the 2 & 4.
  [0, 4, 8, 12].forEach((i) => (p.kick[i] = true));
  [2, 6, 10, 14].forEach((i) => (p.openHat[i] = true));
  [4, 12].forEach((i) => (p.clap[i] = true));
  [0, 2, 4, 6, 8, 10, 12, 14].forEach((i) => (p.hat[i] = true));
  return p;
}

function lofiPattern(): BeatPattern {
  const p = emptyPattern();
  // 80 BPM lo-fi — laid-back, sparse hats, kick on 1, snare on 5+9.
  [0, 10].forEach((i) => (p.kick[i] = true));
  [4, 12].forEach((i) => (p.snare[i] = true));
  [2, 6, 10, 14].forEach((i) => (p.hat[i] = true));
  return p;
}

export const STUDIO_TEMPLATES: StudioTemplate[] = [
  {
    id: "tpl-boom-bap-90",
    label: "Boom Bap · 90 BPM",
    description: "Dusty kick, crisp snare, swung hats — '95 sample-loop feel.",
    bpm: 90,
    kit: "boomBap",
    pattern: boomBapPattern(),
    genre: "boom-bap",
    badge: "🪕",
  },
  {
    id: "tpl-trap-140",
    label: "Trap · 140 BPM",
    description: "Hard kick, rolling hats, 808 slides. Modern-radio bones.",
    bpm: 140,
    kit: "trap",
    pattern: trapPattern(),
    genre: "trap",
    badge: "🔥",
  },
  {
    id: "tpl-drill-145",
    label: "Drill · 145 BPM",
    description: "UK-drill swing, 808 slides, snare 1+e+a pocket.",
    bpm: 145,
    kit: "drill",
    pattern: drillPattern(),
    genre: "drill",
    badge: "⚡",
  },
  {
    id: "tpl-pop-110",
    label: "Pop · 110 BPM",
    description: "Bright four-on-the-floor with clap layer — radio-ready bed.",
    bpm: 110,
    kit: "acoustic",
    pattern: popPattern(),
    genre: "pop",
    badge: "✨",
  },
  {
    id: "tpl-house-124",
    label: "House · 124 BPM",
    description: "Driving 4/4 kick, off-beat open hats, clap on the 2 & 4.",
    bpm: 124,
    kit: "trap",
    pattern: housePattern(),
    genre: "house",
    badge: "🏠",
  },
  {
    id: "tpl-lofi-80",
    label: "Lo-fi · 80 BPM",
    description: "Sparse, low-pass-able loop for chill / study vibes.",
    bpm: 80,
    kit: "lofi",
    pattern: lofiPattern(),
    genre: "lofi",
    badge: "☕",
  },
];

export function getTemplateById(id: string): StudioTemplate | undefined {
  return STUDIO_TEMPLATES.find((t) => t.id === id);
}
