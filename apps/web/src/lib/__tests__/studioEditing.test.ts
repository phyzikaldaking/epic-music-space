import { describe, expect, it } from "vitest";
import { buildEqualPowerCrossfade, crossfadeClips, normalizeClip, slipClipFrames, splitClipAtFrame, trimClip, trimClipFrames } from "@/app/studio/try/studio/editing";

const clip = { id:"c", name:"clip", url:"x", type:"audio/wav", size:1, duration:4, peaks:[.25, -.5], start:0, trimStart:0, trimEnd:0, fadeIn:0, fadeOut:0, gain:0, muted:false, locked:false };

describe("professional Studio editing", () => {
  it("clamps non-destructive trims to the source duration", () => {
    expect(trimClip(clip, { left: 1, right: 9 })).toMatchObject({ trimStart: 1, trimEnd: 3 });
  });

  it("normalizes clip gain from its waveform peak", () => {
    expect(normalizeClip(clip, -1).gain).toBeCloseTo(5.02, 1);
  });

  it("builds a bounded crossfade without mutating either source clip", () => {
    const right = { ...clip, id: "right", start: 3.5 };
    const result = crossfadeClips(clip, right, .5);
    expect(result).toMatchObject({ overlap: .5, left: { fadeOut: .5 }, right: { fadeIn: .5 } });
    expect(clip.fadeOut).toBe(0);
  });

  it("splits into adjacent frame-domain clips that retain the original source", () => {
    const source = { ...clip, sourceId: "source-1", startFrame: 48_000, durationFrames: 192_000, trimStartFrame: 0, trimEndFrame: 0 };
    const command = splitClipAtFrame(source, 144_000, 48_000, { leftId: "left", rightId: "right" });
    expect(command.after).toMatchObject([
      { id: "left", sourceId: "source-1", startFrame: 48_000, trimEndFrame: 96_000 },
      { id: "right", sourceId: "source-1", startFrame: 144_000, trimStartFrame: 96_000 },
    ]);
    expect(command.before).toEqual(source);
  });

  it("trims within source bounds and includes an undo payload", () => {
    const source = { ...clip, sourceId: "source-1", startFrame: 48_000, durationFrames: 192_000, trimStartFrame: 0, trimEndFrame: 0 };
    const command = trimClipFrames(source, { leftDeltaFrames: 24_000, rightDeltaFrames: 500_000 }, 48_000);
    expect(command.after).toMatchObject({ sourceId: "source-1", startFrame: 72_000, trimStartFrame: 24_000, trimEndFrame: 167_999 });
    expect(command.undo).toEqual(source);
  });

  it("slips the source window while preserving timeline position and visible length", () => {
    const source = { ...clip, startFrame: 48_000, durationFrames: 240_000, trimStartFrame: 24_000, trimEndFrame: 48_000 };
    const command = slipClipFrames(source, 12_000, 48_000);
    expect(command.after).toMatchObject({ startFrame: 48_000, trimStartFrame: 36_000, trimEndFrame: 36_000 });
    expect(command.after.trimEndFrame! - command.after.trimStartFrame!).toBe(0);
    expect(command.before).toEqual(source);
    expect(slipClipFrames(source, 500_000, 48_000).after).toMatchObject({ trimStartFrame: 72_000, trimEndFrame: 0 });
  });

  it("creates an editable equal-power crossfade whose center maintains constant power", () => {
    const right = { ...clip, id: "right", sourceId: "source-right", start: 3.5 };
    const fade = buildEqualPowerCrossfade(clip, right, 24_000, 48_000, 5);
    expect(fade).toMatchObject({ curve: "equal-power", overlapFrames: 24_000, leftSourceId: "c", rightSourceId: "source-right" });
    const center = fade.points[2];
    expect(center.leftGain ** 2 + center.rightGain ** 2).toBeCloseTo(1, 6);
    expect(fade.points[0]).toMatchObject({ leftGain: 1, rightGain: 0 });
    expect(fade.points[4]).toMatchObject({ leftGain: 0, rightGain: 1 });
  });
});
