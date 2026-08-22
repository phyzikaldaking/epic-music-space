import { describe, expect, it } from "vitest";
import {
  calculateRecordingAlignment,
  appendTakeToLane,
  activateTakeInLane,
  createCompMap,
  createRecordingTake,
  validatePunchRange,
} from "@/app/studio/try/studio/recording";

describe("Studio recording domain", () => {
  it("combines measured latency and manual calibration while bounding unsafe alignment", () => {
    expect(calculateRecordingAlignment({ inputMs: 12, outputMs: 8, baseMs: 5, measuredAt: "2026-08-22T00:00:00.000Z" }, 3)).toBe(0.028);
    expect(calculateRecordingAlignment({ inputMs: 900, outputMs: 400, baseMs: 100, measuredAt: "2026-08-22T00:00:00.000Z" }, 500)).toBe(0.25);
  });

  it("rejects punch ranges that cannot capture useful audio", () => {
    expect(validatePunchRange({ inSec: 4, outSec: 3 })).toEqual({ ok: false, reason: "Punch out must be after punch in." });
    expect(validatePunchRange({ inSec: -1, outSec: 3 })).toEqual({ ok: false, reason: "Punch points cannot be negative." });
    expect(validatePunchRange({ inSec: 2, outSec: 2.005 })).toEqual({ ok: false, reason: "Punch range must be at least 10 ms." });
    expect(validatePunchRange({ inSec: 2, outSec: 4 })).toEqual({ ok: true });
  });

  it("creates a new immutable source for every loop-recording pass", () => {
    const first = createRecordingTake({ trackId: "track-vocal", laneId: "lane-vocal", pass: 1, sourceId: "source-1", durationSec: 8, startedAtSec: 0 });
    const second = createRecordingTake({ trackId: "track-vocal", laneId: "lane-vocal", pass: 2, sourceId: "source-2", durationSec: 8, startedAtSec: 0 });

    expect(first).toMatchObject({ id: "lane-vocal:pass:1", sourceId: "source-1", pass: 1 });
    expect(second).toMatchObject({ id: "lane-vocal:pass:2", sourceId: "source-2", pass: 2 });
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.sourceId).not.toBe(second.sourceId);
  });

  it("builds a reversible comp map and rejects overlapping selections", () => {
    const comp = createCompMap("track-vocal", [
      { takeId: "take-1", sourceStartSec: 0, timelineStartSec: 0, durationSec: 2 },
      { takeId: "take-2", sourceStartSec: 1, timelineStartSec: 2, durationSec: 2 },
    ]);

    expect(comp).toMatchObject({ trackId: "track-vocal", durationSec: 4 });
    expect(comp.segments).toHaveLength(2);
    expect(() => createCompMap("track-vocal", [
      { takeId: "take-1", sourceStartSec: 0, timelineStartSec: 0, durationSec: 3 },
      { takeId: "take-2", sourceStartSec: 0, timelineStartSec: 2, durationSec: 2 },
    ])).toThrow("Comp segments cannot overlap");
  });

  it("appends loop passes without changing prior take objects", () => {
    const first = createRecordingTake({ trackId: "vocal", laneId: "lane-vocal", pass: 1, sourceId: "source-1", durationSec: 4, startedAtSec: 0 });
    const second = createRecordingTake({ trackId: "vocal", laneId: "lane-vocal", pass: 2, sourceId: "source-2", durationSec: 4, startedAtSec: 0 });
    const lane = appendTakeToLane(undefined, first);
    const updated = appendTakeToLane(lane, second);
    expect(updated.takes.map((take) => take.sourceId)).toEqual(["source-1", "source-2"]);
    expect(lane.takes).toHaveLength(1);
    expect(updated.activeTakeId).toBe(second.id);
    expect(activateTakeInLane(updated, first.id).activeTakeId).toBe(first.id);
    expect(() => activateTakeInLane(updated, "missing")).toThrow("Take does not exist in this lane");
  });
});
