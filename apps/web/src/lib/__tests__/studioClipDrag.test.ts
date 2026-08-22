import { describe, expect, it } from "vitest";
import { applyClipDrag, createClipDragIntent } from "@/app/studio/try/studio/clipDrag";

const clip = { id: "clip-1", name: "Audio", url: "x", type: "audio/wav", size: 1, duration: 4, peaks: [], start: 2, trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0, gain: 0, muted: false, locked: false };
const tracks = [
  { id: "a", name: "A", color: "#fff", armed: false, muted: false, solo: false, volume: 80, pan: 0, inputGain: 50, clips: [clip] },
  { id: "b", name: "B", color: "#fff", armed: false, muted: false, solo: false, volume: 80, pan: 0, inputGain: 50, clips: [] },
];

describe("Studio clip dragging", () => {
  it("moves across tracks and preserves the pointer offset", () => {
    const intent = createClipDragIntent({ clip, sourceTrackId: "a", targetTrackId: "b", pointerSeconds: 8, pointerOffsetSeconds: 1, mode: "free", gridSeconds: .25 });
    expect(intent).toMatchObject({ allowed: true, start: 7, targetTrackId: "b" });
    expect(applyClipDrag(tracks, intent)[1].clips[0]).toMatchObject({ id: "clip-1", start: 7 });
  });

  it("snaps in grid mode and clamps negative positions", () => {
    expect(createClipDragIntent({ clip, sourceTrackId: "a", targetTrackId: "a", pointerSeconds: 2.62, pointerOffsetSeconds: 1, mode: "grid", gridSeconds: .5 }).start).toBe(1.5);
    expect(createClipDragIntent({ clip, sourceTrackId: "a", targetTrackId: "a", pointerSeconds: .2, pointerOffsetSeconds: 1, mode: "free", gridSeconds: .5 }).start).toBe(0);
  });

  it("rejects locked clips and unknown target tracks", () => {
    const locked = createClipDragIntent({ clip: { ...clip, locked: true }, sourceTrackId: "a", targetTrackId: "b", pointerSeconds: 3, pointerOffsetSeconds: 0, mode: "free", gridSeconds: .25 });
    expect(locked.allowed).toBe(false);
    expect(applyClipDrag(tracks, locked)).toBe(tracks);
    expect(applyClipDrag(tracks, { ...locked, allowed: true, targetTrackId: "missing" })).toBe(tracks);
  });
});
