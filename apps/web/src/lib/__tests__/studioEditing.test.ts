import { describe, expect, it } from "vitest";
import { crossfadeClips, normalizeClip, trimClip } from "@/app/studio/try/studio/editing";

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
});
