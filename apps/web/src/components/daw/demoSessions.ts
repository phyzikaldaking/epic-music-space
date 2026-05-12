import {
  type BeatPattern,
  type DrumKitId,
  emptyPattern as emptyBeatPattern,
} from "./beatMachine";

/** A pre-loaded "demo session" the studio can drop in for first-time
 *  visitors. The curated demo is hand-tuned (kit + pattern + BPM) so it
 *  sounds intentional rather than random. The random demo defers to the
 *  existing surpriseSession() generator on the DawWorkspace side. */
export interface DemoSession {
  id: string;
  label: string;
  description: string;
  bpm: number;
  kit: DrumKitId;
  pattern: BeatPattern;
  /** Optional set of pre-mixed stems. When present, the loader prefers
   *  these over the synth-rendered beat machine — they sound "made", not
   *  procedural. Each entry is decoded into its own track on import. */
  stems?: DemoStem[];
}

export interface DemoStem {
  name: string;
  color: string;
  /** Public path under apps/web/public — e.g. /samples/demo-sessions/trap-142/kick.wav */
  url: string;
}

/** Manifest of curated demo sessions. The stems array is the slot for
 *  hand-mixed audio assets; until those assets ship, the loader falls
 *  back to the synth-rendered beat machine pattern below. */
export const DEMO_SESSIONS: DemoSession[] = [
  {
    id: "trap-142",
    label: "Trap demo · 142 BPM",
    description:
      "Hand-tuned trap pattern: tight kick, half-time snare, rolling hats, sub-locked 808. Loads real stems when available.",
    bpm: 142,
    kit: "trap",
    pattern: (() => {
      const p = emptyBeatPattern();
      setSteps(p, "kick", [0, 6, 8, 14]);
      setSteps(p, "snare", [4, 12]);
      setSteps(p, "hat", [0, 2, 4, 6, 8, 10, 11, 12, 13, 14, 15]);
      setSteps(p, "bass808", [0, 6, 8, 14]);
      setSteps(p, "perc", [10]);
      return p;
    })(),
    stems: [
      { name: "Kick", color: "#FF6B35", url: "/samples/demo-sessions/trap-142/kick.wav" },
      { name: "Snare", color: "#F7931E", url: "/samples/demo-sessions/trap-142/snare.wav" },
      { name: "Hi-hat", color: "#FDB913", url: "/samples/demo-sessions/trap-142/hat.wav" },
      { name: "808 bass", color: "#004E89", url: "/samples/demo-sessions/trap-142/808.wav" },
      { name: "Perc", color: "#A23B72", url: "/samples/demo-sessions/trap-142/perc.wav" },
    ],
  },
];

/** Look up a curated demo by id (e.g. when a deep link or A/B test
 *  preset asks for a specific one). Falls back to curatedTrapDemo()
 *  when nothing matches. */
export function getDemoById(id: string): DemoSession {
  return DEMO_SESSIONS.find((d) => d.id === id) ?? curatedTrapDemo();
}

/** Build a curated trap-flavored pattern. We use the engine's existing
 *  beat-machine grid (8 lanes × 16 steps), so no new audio assets need to
 *  ship. The user hears the kit immediately on Play. */
export function curatedTrapDemo(): DemoSession {
  const pattern = emptyBeatPattern();
  // Kick: classic trap "1, 1.75, 3.5" pattern (steps 0, 6, 14, plus 4 to
  // anchor the second half).
  setSteps(pattern, "kick", [0, 6, 8, 14]);
  // Snare on 5 and 13 — the 2 & 4 backbeat at half-time.
  setSteps(pattern, "snare", [4, 12]);
  // Hi-hat: fast 1/16ths in the second half (trap hi-hat roll).
  setSteps(pattern, "hat", [0, 2, 4, 6, 8, 10, 11, 12, 13, 14, 15]);
  // 808 sub locked to kick.
  setSteps(pattern, "bass808", [0, 6, 8, 14]);
  // Sparse percussion fills.
  setSteps(pattern, "perc", [10]);
  return {
    id: "trap-142",
    label: "Trap demo · 142 BPM",
    description:
      "Hand-tuned trap pattern: tight kick, half-time snare, rolling hats, sub-locked 808. Press Play to hear it.",
    bpm: 142,
    kit: "trap",
    pattern,
  };
}

function setSteps(
  pattern: BeatPattern,
  lane: keyof BeatPattern,
  steps: number[],
): void {
  const row = pattern[lane];
  for (const s of steps) {
    if (s >= 0 && s < row.length) row[s] = true;
  }
}
