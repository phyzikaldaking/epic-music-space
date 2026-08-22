import { describe, expect, it } from "vitest";
import { chooseBufferEvictions, estimateSessionCapacity, STUDIO_CERTIFICATION_FIXTURE } from "@/app/studio/try/studio/sessionCapacity";

describe("Studio session capacity", () => {
  it("certifies the 32-track 60-minute target using streamed media", () => {
    const estimate = estimateSessionCapacity(STUDIO_CERTIFICATION_FIXTURE);
    expect(estimate).toMatchObject({ trackCount: 32, durationMinutes: 60, strategy: "stream-and-cache", certified: true });
    expect(estimate.fullDecodeBytes).toBeGreaterThan(20_000_000_000);
    expect(estimate.workingSetBytes).toBeLessThanOrEqual(512 * 1024 * 1024);
  });

  it("evicts least-recently-used unpinned buffers until under budget", () => {
    const buffers = [
      { id: "playing", bytes: 180, lastUsedAt: 1, pinned: true },
      { id: "old", bytes: 120, lastUsedAt: 2, pinned: false },
      { id: "new", bytes: 100, lastUsedAt: 3, pinned: false },
    ];
    expect(chooseBufferEvictions(buffers, 250)).toEqual(["old", "new"]);
  });
});
