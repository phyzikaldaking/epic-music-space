import { describe, expect, it } from "vitest";
import { freezeTrack, unfreezeTrack } from "@/app/studio/try/studio/freeze";

const track = { id: "track-1", clips: [{ id: "clip-1" }], inserts: [{ id: "fx-1", bypassed: false }], frozen: false };
describe("Studio track freeze", () => {
  it("replaces processor-heavy playback with a render while preserving source state", () => {
    const command = freezeTrack(track, { sourceId: "freeze-source", url: "https://cdn/freeze.wav", renderedAt: "2026-08-22T00:00:00Z" });
    expect(command.after).toMatchObject({ frozen: true, frozenRender: { sourceId: "freeze-source" }, clips: [], inserts: [] });
    expect(command.after.freezeSource).toEqual(track);
    expect(unfreezeTrack(command.after)).toEqual(track);
  });
});
