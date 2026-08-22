import { describe, expect, it } from "vitest";
import { createRecordingCoordinator, type TrackRecorder } from "@/app/studio/try/studio/recordingCoordinator";

function recorder(sourceId: string, durationSec = 4): TrackRecorder & { cancelled: boolean; disposed: boolean } {
  return {
    cancelled: false,
    disposed: false,
    start() {},
    async stop() { return { sourceId, durationSec }; },
    cancel() { this.cancelled = true; },
    dispose() { this.disposed = true; },
  };
}

describe("Studio recording coordinator", () => {
  it("records armed tracks independently without changing existing clips", async () => {
    const vocal = recorder("source-vocal");
    const guitar = recorder("source-guitar");
    const coordinator = createRecordingCoordinator({ createRecorder: (trackId) => trackId === "vocal" ? vocal : guitar });
    const existingClips = [{ id: "existing" }];

    coordinator.arm({ trackId: "vocal", laneId: "lane-vocal" });
    coordinator.arm({ trackId: "guitar", laneId: "lane-guitar" });
    coordinator.start({ startedAtSec: 8 });
    const takes = await coordinator.completePass();

    expect(takes.map((take) => [take.trackId, take.sourceId])).toEqual([["vocal", "source-vocal"], ["guitar", "source-guitar"]]);
    expect(existingClips).toEqual([{ id: "existing" }]);
  });

  it("creates sequential loop passes and clips them to punch boundaries", async () => {
    let pass = 0;
    const coordinator = createRecordingCoordinator({ createRecorder: () => recorder(`source-${++pass}`, 8) });
    coordinator.arm({ trackId: "vocal", laneId: "lane-vocal" });

    coordinator.start({ startedAtSec: 0, punch: { inSec: 2, outSec: 6 } });
    const first = await coordinator.completePass({ loop: true });
    const second = await coordinator.completePass();

    expect(first[0]).toMatchObject({ pass: 1, startedAtSec: 2, durationSec: 4 });
    expect(second[0]).toMatchObject({ pass: 2, startedAtSec: 2, durationSec: 4 });
  });

  it("cancels and disposes every active recorder", () => {
    const instances: Array<ReturnType<typeof recorder>> = [];
    const coordinator = createRecordingCoordinator({ createRecorder: () => { const value = recorder(`source-${instances.length}`); instances.push(value); return value; } });
    coordinator.arm({ trackId: "vocal", laneId: "lane-vocal" });
    coordinator.start({ startedAtSec: 0 });
    coordinator.cancel();
    coordinator.dispose();
    expect(instances[0]).toMatchObject({ cancelled: true, disposed: true });
  });
});
