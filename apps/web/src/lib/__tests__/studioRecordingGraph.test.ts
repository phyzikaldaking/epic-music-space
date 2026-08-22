import { describe, expect, it } from "vitest";
import { calculateMeterFrame, resolveMonitoringPolicy } from "@/app/studio/try/studio/recordingGraph";

describe("Studio recording graph policies", () => {
  it("calculates peak and RMS independently and holds clipping for two seconds", () => {
    const samples = new Float32Array([0, .5, -.5, 1]);
    const clipped = calculateMeterFrame(samples, 1_000, 0);
    expect(clipped.peak).toBe(1);
    expect(clipped.rms).toBe(.6124);
    expect(clipped.peakDb).toBe(0);
    expect(clipped.rmsDb).toBe(-4.26);
    expect(clipped.clipping).toBe(true);
    expect(clipped.clipHoldUntil).toBe(3_000);

    const quiet = calculateMeterFrame(new Float32Array([.1, -.1]), 2_000, clipped.clipHoldUntil);
    expect(quiet.clipping).toBe(false);
    expect(quiet.clipHeld).toBe(true);
  });

  it("keeps monitoring muted until explicitly enabled and warns without headphone confirmation", () => {
    expect(resolveMonitoringPolicy({ enabled: false, headphonesConfirmed: false, gain: .8 })).toEqual({ gain: 0, warning: null });
    expect(resolveMonitoringPolicy({ enabled: true, headphonesConfirmed: false, gain: .8 })).toEqual({
      gain: .8,
      warning: "Use headphones to prevent speaker feedback and echo.",
    });
    expect(resolveMonitoringPolicy({ enabled: true, headphonesConfirmed: true, gain: 2 })).toEqual({ gain: 1, warning: null });
  });
});
