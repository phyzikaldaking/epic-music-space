import { describe, expect, it } from "vitest";
import { copyStudioItems, cutStudioItems, duplicateStudioItems, pasteStudioItems, type StudioClipboardItem } from "@/app/studio/try/studio/editClipboard";

const items: StudioClipboardItem[] = [
  { kind: "clip", id: "clip-1", payload: { name: "Verse", startFrame: 100 } },
  { kind: "track", id: "track-1", payload: { name: "Lead" } },
  { kind: "automation", id: "auto-1", payload: { parameter: "volume", points: [1, 2] } },
  { kind: "effect", id: "fx-1", payload: { effectId: "compressor" } },
  { kind: "section", id: "section-1", payload: { name: "Chorus", startFrame: 200 } },
];

describe("Studio multi-domain clipboard", () => {
  it("copies every supported edit domain without sharing mutable payloads", () => {
    const clipboard = copyStudioItems(items);
    (items[2].payload as { points: number[] }).points.push(3);
    expect(clipboard.items.map((item) => item.kind)).toEqual(["clip", "track", "automation", "effect", "section"]);
    expect((clipboard.items[2].payload as { points: number[] }).points).toEqual([1, 2]);
  });

  it("cuts selected items and returns a reversible removal command", () => {
    const command = cutStudioItems(items, new Set(["clip-1", "fx-1"]));
    expect(command.after.map((item) => item.id)).toEqual(["track-1", "auto-1", "section-1"]);
    expect(command.undo).toEqual(items);
    expect(command.clipboard.items.map((item) => item.id)).toEqual(["clip-1", "fx-1"]);
  });

  it("pastes and duplicates with fresh IDs and an optional frame offset", () => {
    let id = 0;
    const idFactory = (kind: string) => `${kind}-copy-${++id}`;
    const pasted = pasteStudioItems(copyStudioItems(items), { idFactory, frameOffset: 50 });
    expect(pasted[0]).toMatchObject({ id: "clip-copy-1", payload: { startFrame: 150 } });
    expect(pasted[4]).toMatchObject({ id: "section-copy-5", payload: { startFrame: 250 } });
    expect(duplicateStudioItems([items[0]], { idFactory, frameOffset: 25 })[0]).toMatchObject({ id: "clip-copy-6", payload: { startFrame: 125 } });
  });
});
