import { describe, expect, it } from "vitest";
import { duplicateSection, exportRangeForSection, loopRangeForSection, navigateMarkers, type SongSection, type TimelineMarker } from "@/app/studio/try/studio/arrangement";

const markers: TimelineMarker[] = [{ id: "m1", name: "Verse", frame: 100 }, { id: "m2", name: "Chorus", frame: 300 }];
const section: SongSection = { id: "s1", name: "Verse", startFrame: 100, endFrame: 300, color: "#65d6ff" };

describe("Studio markers and sections", () => {
  it("navigates marker boundaries in either direction", () => {
    expect(navigateMarkers(markers, 120, "next")).toBe(300);
    expect(navigateMarkers(markers, 300, "previous")).toBe(100);
    expect(navigateMarkers(markers, 500, "next")).toBe(500);
  });

  it("uses named sections as exact loop and export ranges", () => {
    expect(loopRangeForSection(section)).toEqual({ startFrame: 100, endFrame: 300, enabled: true });
    expect(exportRangeForSection(section, 48_000)).toEqual({ name: "Verse", startSec: 100 / 48_000, endSec: 300 / 48_000 });
  });

  it("duplicates a section and its contained clips with new IDs", () => {
    let id = 0;
    const result = duplicateSection(section, [{ id: "inside", startFrame: 150 }, { id: "outside", startFrame: 400 }], { idFactory: (kind) => `${kind}-${++id}` });
    expect(result.section).toMatchObject({ id: "section-1", name: "Verse copy", startFrame: 300, endFrame: 500 });
    expect(result.items).toEqual([{ id: "item-2", startFrame: 350 }]);
  });
});
