import { describe, expect, it } from "vitest";
import { quantizeTransientMarkers } from "@/app/studio/try/studio/quantization";

const markers = [
  { id: "a", sourceId: "source-1", frame: 110, strength: .8, edited: false },
  { id: "b", sourceId: "source-1", frame: 260, strength: .7, edited: true },
];

describe("Studio audio quantization", () => {
  it("moves markers toward the grid by the requested strength", () => {
    const command = quantizeTransientMarkers(markers, { gridFrames: 100, strength: .5 });
    expect(command.after.map((marker) => marker.frame)).toEqual([105, 280]);
    expect(command.after.map((marker) => marker.id)).toEqual(["a", "b"]);
    expect(command.undo).toEqual(markers);
  });

  it("supports zero/full strength and maximum displacement", () => {
    expect(quantizeTransientMarkers(markers, { gridFrames: 100, strength: 0 }).after).toEqual(markers);
    expect(quantizeTransientMarkers(markers, { gridFrames: 100, strength: 1, maxShiftFrames: 20 }).after.map((marker) => marker.frame)).toEqual([100, 280]);
  });
});
