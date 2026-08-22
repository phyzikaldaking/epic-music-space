import { describe, expect, it } from "vitest";
import { countInDurationSeconds, metronomeEventTimes, nextPunchTransition } from "@/app/studio/try/studio/recordingTransport";

describe("Studio recording transport", () => {
  it("calculates one, two, and four bar count-ins at the current tempo", () => {
    expect(countInDurationSeconds({ bpm: 120, bars: 1, beatsPerBar: 4 })).toBe(2);
    expect(countInDurationSeconds({ bpm: 120, bars: 2, beatsPerBar: 4 })).toBe(4);
    expect(countInDurationSeconds({ bpm: 120, bars: 4, beatsPerBar: 4 })).toBe(8);
    expect(countInDurationSeconds({ bpm: 90, bars: 1, beatsPerBar: 3 })).toBe(2);
  });

  it("schedules subdivisions with accents on each downbeat", () => {
    expect(metronomeEventTimes({ startAtSec: 10, bpm: 120, bars: 1, beatsPerBar: 4, subdivision: "1/8", accentDownbeat: true })).toEqual([
      { atSec: 10, accent: true },
      { atSec: 10.25, accent: false },
      { atSec: 10.5, accent: false },
      { atSec: 10.75, accent: false },
      { atSec: 11, accent: false },
      { atSec: 11.25, accent: false },
      { atSec: 11.5, accent: false },
      { atSec: 11.75, accent: false },
    ]);
  });

  it("returns deterministic punch transitions at the boundaries", () => {
    const range = { inSec: 2, outSec: 4 };
    expect(nextPunchTransition(1.99, range, false)).toBe("none");
    expect(nextPunchTransition(2, range, false)).toBe("start");
    expect(nextPunchTransition(3, range, true)).toBe("none");
    expect(nextPunchTransition(4, range, true)).toBe("stop");
  });
});
