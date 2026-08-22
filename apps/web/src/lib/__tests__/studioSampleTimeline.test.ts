import { describe, expect, it } from "vitest";
import { convertFrameRate, framesToPixels, framesToSeconds, normalizeFrameRange, pixelsToFrames, secondsToFrames, snapFrame } from "@/app/studio/try/studio/sampleTimeline";
import { clipStartFrames, visibleClipFrames } from "@/app/studio/try/studio/timeline";

describe("Studio sample-domain timeline", () => {
  it("round-trips seconds using integer frames", () => {
    expect(secondsToFrames(1.25, 48_000)).toBe(60_000);
    expect(framesToSeconds(60_000, 48_000)).toBe(1.25);
    expect(secondsToFrames(-2, 48_000)).toBe(0);
  });

  it("normalizes ranges and sample-rate conversion without fractional frames", () => {
    expect(normalizeFrameRange({ startFrame: -10, endFrame: 5 })).toEqual({ startFrame: 0, endFrame: 5, lengthFrames: 5 });
    expect(convertFrameRate(44_100, 44_100, 48_000)).toBe(48_000);
  });

  it("uses reversible zoom math and deterministic frame snapping", () => {
    expect(pixelsToFrames(framesToPixels(96_000, 48_000, 120), 48_000, 120)).toBe(96_000);
    expect(snapFrame(25_001, 12_000, true)).toBe(24_000);
    expect(snapFrame(-10, 12_000, false)).toBe(0);
  });

  it("prefers canonical frame fields but reads legacy seconds", () => {
    const clip = { duration: 4, start: 1, trimStart: .25, trimEnd: .5, startFrame: 96_000, durationFrames: 240_000, trimStartFrame: 24_000, trimEndFrame: 48_000 };
    expect(clipStartFrames(clip, 48_000)).toBe(96_000);
    expect(visibleClipFrames(clip, 48_000)).toBe(168_000);
    expect(clipStartFrames({ duration: 4, start: 1, trimStart: 0, trimEnd: 0 }, 48_000)).toBe(48_000);
  });
});
