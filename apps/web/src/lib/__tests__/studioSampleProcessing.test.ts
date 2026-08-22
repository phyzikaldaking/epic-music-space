import { describe, expect, it } from "vitest";
import { processPadSample } from "@/app/studio/try/studio/sampleProcessing";

const sample = { sourceId: "source-1", durationFrames: 48_000, peaks: [.25, -.5], trimStartFrame: 0, trimEndFrame: 0, fadeInFrames: 0, fadeOutFrames: 0, tuneCents: 0, reversed: false, chokeGroup: null, envelope: { attackMs: 0, decayMs: 0, sustain: 1, releaseMs: 20 }, gainDb: 0 };

describe("Studio pad sample processing", () => {
  it("applies bounded non-destructive trim, fade, tune, reverse, choke and envelope", () => {
    const command = processPadSample(sample, { trimStartFrame: 12_000, trimEndFrame: 12_000, fadeInFrames: 20_000, fadeOutFrames: 20_000, tuneCents: 2500, reversed: true, chokeGroup: 2, envelope: { attackMs: 10, decayMs: 80, sustain: .6, releaseMs: 300 } });
    expect(command.after).toMatchObject({ sourceId: "source-1", trimStartFrame: 12_000, trimEndFrame: 12_000, fadeInFrames: 20_000, fadeOutFrames: 20_000, tuneCents: 2400, reversed: true, chokeGroup: 2, envelope: { attackMs: 10, decayMs: 80, sustain: .6, releaseMs: 300 } });
    expect(command.undo).toEqual(sample);
  });

  it("normalizes gain from source peaks without rewriting audio", () => {
    expect(processPadSample(sample, { normalizeToDb: -1 }).after.gainDb).toBeCloseTo(5.02, 1);
    expect(processPadSample({ ...sample, peaks: [0, 0] }, { normalizeToDb: -1 }).after.gainDb).toBe(0);
  });
});
