import { describe, expect, it } from "vitest";
import { applyPitchShift, applyTimeStretch } from "@/app/studio/try/studio/audioProcessing";

const clip = { id: "clip-1", sourceId: "source-1", name: "Audio", url: "x", type: "audio/wav", size: 1, duration: 4, durationFrames: 192_000, peaks: [], start: 0, trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0, gain: 0, muted: false, locked: false };

describe("Studio time and pitch processing", () => {
  it("stretches duration while preserving pitch and recording render metadata", () => {
    const command = applyTimeStretch(clip, 1.5, { algorithm: "phase-vocoder", quality: "high", sampleRate: 48_000 });
    expect(command.after).toMatchObject({ sourceId: "source-1", durationFrames: 288_000, duration: 6, playbackRate: 2 / 3, timeStretch: { ratio: 1.5, preservesPitch: true, algorithm: "phase-vocoder", quality: "high" } });
    expect(command.undo).toEqual(clip);
  });

  it("clamps unsafe stretch ratios", () => {
    expect(applyTimeStretch(clip, 99, { algorithm: "granular", quality: "preview", sampleRate: 48_000 }).after.timeStretch?.ratio).toBe(4);
  });

  it("shifts semitones and cents without changing clip duration", () => {
    const command = applyPitchShift(clip, { semitones: -3, cents: 27, algorithm: "elastique", preserveFormants: true });
    expect(command.after).toMatchObject({ durationFrames: 192_000, duration: 4, pitchSemitones: -3, pitchCents: 27, pitchShift: { totalCents: -273, algorithm: "elastique", preserveFormants: true } });
    expect(command.undo).toEqual(clip);
  });

  it("normalizes cent overflow and clamps to two octaves", () => {
    expect(applyPitchShift(clip, { semitones: 30, cents: 80, algorithm: "realtime", preserveFormants: false }).after.pitchShift?.totalCents).toBe(2400);
  });
});
