import { describe, expect, it } from "vitest";
import { previewPreset, searchPresets, togglePresetFavorite } from "@/app/studio/try/studio/presets";

const presets = [{ id: "p1", instrument: "bass", name: "Deep Sub", tags: ["dark"], version: 2, favorite: false, parameters: { cutoff: .4 } }, { id: "p2", instrument: "keys", name: "Bright Keys", tags: ["bright"], version: 1, favorite: true, parameters: { tone: .8 } }];

describe("Studio presets", () => {
  it("searches musical metadata and favorites", () => {
    expect(searchPresets(presets, { text: "sub", instrument: "bass" }).map((item) => item.id)).toEqual(["p1"]);
    expect(searchPresets(presets, { favoritesOnly: true }).map((item) => item.id)).toEqual(["p2"]);
  });
  it("previews a versioned snapshot and toggles favorites immutably", () => {
    expect(previewPreset(presets[0])).toMatchObject({ presetId: "p1", version: 2, status: "previewing", parameters: { cutoff: .4 } });
    expect(togglePresetFavorite(presets, "p1")[0].favorite).toBe(true);
    expect(presets[0].favorite).toBe(false);
  });
});
