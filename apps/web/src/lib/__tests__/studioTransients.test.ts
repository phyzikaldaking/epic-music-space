import { describe, expect, it } from "vitest";
import { addTransient, buildTransientSlices, detectTransientMarkers, moveTransient, removeTransient } from "@/app/studio/try/studio/audioAnalysis";

describe("Studio transient markers", () => {
  it("detects threshold crossings with minimum spacing", () => {
    const markers = detectTransientMarkers([0, .1, .8, .9, .1, .85, .1], { sourceId: "source-1", framesPerPeak: 100, threshold: .6, minSpacingFrames: 250 });
    expect(markers).toEqual([{ id: "source-1-transient-200", sourceId: "source-1", frame: 200, strength: .8, edited: false }, { id: "source-1-transient-500", sourceId: "source-1", frame: 500, strength: .85, edited: false }]);
  });

  it("adds, moves, and removes markers without mutating prior state", () => {
    const original = [{ id: "t1", sourceId: "source-1", frame: 100, strength: .8, edited: false }];
    const added = addTransient(original, { id: "t2", sourceId: "source-1", frame: 50, strength: 1 });
    expect(added.map((item) => item.frame)).toEqual([50, 100]);
    expect(moveTransient(added, "t1", 25).find((item) => item.id === "t1")).toMatchObject({ frame: 25, edited: true });
    expect(removeTransient(added, "t2")).toEqual(original);
    expect(original[0].edited).toBe(false);
  });

  it("turns marker boundaries into reusable non-overlapping slice ranges", () => {
    expect(buildTransientSlices([{ id: "a", sourceId: "s", frame: 200, strength: 1, edited: false }, { id: "b", sourceId: "s", frame: 500, strength: 1, edited: false }], 800)).toEqual([{ startFrame: 0, endFrame: 200 }, { startFrame: 200, endFrame: 500 }, { startFrame: 500, endFrame: 800 }]);
  });
});
