import { describe, expect, it } from "vitest";
import { buildBeatStemRenderPlan } from "@/app/studio/beat-machine/beatStemPrint";

const pads = [
  { id: "kick", label: "KICK", freq: 54, volume: 88, pan: 0, muted: false, solo: false, steps: [true, false, false, false] },
  { id: "snare", label: "SNARE", freq: 180, volume: 74, pan: -12, muted: false, solo: false, steps: [false, false, true, false] },
  { id: "hat", label: "HAT", freq: 6500, volume: 48, pan: 14, muted: true, solo: false, steps: [true, true, true, true] },
];

describe("Beat Lab multitrack printing", () => {
  it("builds synchronized render plans for audible pads", () => {
    const plan = buildBeatStemRenderPlan(pads, 120);

    expect(plan).toEqual([
      { id: "kick", label: "KICK", fileName: "Beat 120 BPM - KICK.wav", durationSec: 1.25, frequency: 54, volume: 88, pan: 0, hitTimesSec: [0] },
      { id: "snare", label: "SNARE", fileName: "Beat 120 BPM - SNARE.wav", durationSec: 1.25, frequency: 180, volume: 74, pan: -12, hitTimesSec: [0.25] },
    ]);
  });

  it("prints only soloed pads when any solo is active", () => {
    const plan = buildBeatStemRenderPlan(pads.map((pad) => ({ ...pad, muted: false, solo: pad.id === "snare" })), 120);

    expect(plan.map((stem) => stem.id)).toEqual(["snare"]);
  });
});
