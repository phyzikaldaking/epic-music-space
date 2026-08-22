import { describe, expect, it } from "vitest";
import { createBeatStep, expandBeatStepEvents } from "@/app/studio/try/studio/beatStep";

describe("Studio advanced sequencer steps", () => {
  it("normalizes every performance parameter", () => {
    expect(createBeatStep({ id: "s", active: true, lengthTicks: 0, subdivision: 16, triplet: true, flamTicks: 12, ratchet: 3, probability: 2, velocity: -.1, microtimingTicks: -8 })).toMatchObject({ lengthTicks: 1, subdivision: 16, triplet: true, flamTicks: 12, ratchet: 3, probability: 1, velocity: .01, microtimingTicks: -8 });
  });

  it("expands ratchets and flam into timestamped hits", () => {
    const step = createBeatStep({ id: "s", active: true, lengthTicks: 120, subdivision: 16, triplet: false, flamTicks: 12, ratchet: 3, probability: 1, velocity: .8, microtimingTicks: -5 });
    expect(expandBeatStepEvents(step, 480, () => 0).map((event) => event.tick)).toEqual([475, 487, 515, 555]);
  });

  it("honors inactive and probability gates deterministically", () => {
    const step = createBeatStep({ id: "s", active: true, probability: .2 });
    expect(expandBeatStepEvents(step, 0, () => .9)).toEqual([]);
    expect(expandBeatStepEvents({ ...step, active: false }, 0, () => 0)).toEqual([]);
  });
});
