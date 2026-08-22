import { describe, expect, it } from "vitest";
import { arrangeBeatPatterns, printPatternToStudio } from "@/app/studio/try/studio/beatArrangement";

describe("Studio beat pattern arrangement", () => {
  it("arranges named patterns into song sections without overlap", () => {
    const sections = arrangeBeatPatterns([{ patternId: "verse", name: "Verse", bars: 4 }, { patternId: "hook", name: "Hook", bars: 8 }], { beatsPerBar: 4, ticksPerBeat: 480 });
    expect(sections).toEqual([{ id: "section-verse-0", patternId: "verse", name: "Verse", startTick: 0, endTick: 7680 }, { id: "section-hook-1", patternId: "hook", name: "Hook", startTick: 7680, endTick: 23040 }]);
  });

  it("prints a versioned pattern as a new Studio source without mutating pattern data", () => {
    const pattern = { id: "hook", name: "Hook", version: 3, durationTicks: 7680, steps: [{ id: "kick", active: true }] };
    const printed = printPatternToStudio(pattern, { clipId: "clip-1", startFrame: 96_000, durationFrames: 192_000 });
    expect(printed).toMatchObject({ id: "clip-1", sourceId: "pattern:hook:v3", renderedFromId: "hook", startFrame: 96_000, durationFrames: 192_000, name: "Hook (Printed)" });
    expect(pattern.steps).toEqual([{ id: "kick", active: true }]);
  });
});
