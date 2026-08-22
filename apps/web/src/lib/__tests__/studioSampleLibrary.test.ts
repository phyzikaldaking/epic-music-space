import { describe, expect, it } from "vitest";
import { indexSamples, searchSamples } from "@/app/studio/try/studio/sampleLibrary";

const samples = [
  { id: "kick", name: "Trap Kick", instrument: "drums", genre: ["trap"], mood: ["dark"], bpm: 140, key: null, favorite: true, lastUsedAt: 20 },
  { id: "bass", name: "Warm Bass", instrument: "bass", genre: ["rnb"], mood: ["warm"], bpm: 92, key: "F#m", favorite: false, lastUsedAt: 30 },
  { id: "keys", name: "Soul Keys", instrument: "keys", genre: ["rnb", "soul"], mood: ["warm"], bpm: 90, key: "F#m", favorite: true, lastUsedAt: 10 },
];

describe("Studio sample library", () => {
  it("indexes all musical facets", () => {
    expect(indexSamples(samples)).toMatchObject({ instruments: ["bass", "drums", "keys"], genres: ["rnb", "soul", "trap"], moods: ["dark", "warm"], keys: ["F#m"] });
  });

  it("filters BPM/key/favorites and supports recents ordering", () => {
    expect(searchSamples(samples, { genre: "rnb", mood: "warm", bpm: 91, bpmTolerance: 2, key: "F#m", favoritesOnly: true }).map((item) => item.id)).toEqual(["keys"]);
    expect(searchSamples(samples, { sort: "recent" }).map((item) => item.id)).toEqual(["bass", "kick", "keys"]);
  });
});
