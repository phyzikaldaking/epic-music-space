import { describe, it, expect } from "vitest";
import {
  buildMadeForYouRail,
  buildTasteSignal,
  type RailCandidate,
} from "../personalizedRail";

function candidate(overrides: Partial<RailCandidate> & { id: string }): RailCandidate {
  return {
    id: overrides.id,
    title: overrides.title ?? `Track ${overrides.id}`,
    artist: overrides.artist ?? "Test Artist",
    genre: overrides.genre ?? null,
    coverUrl: overrides.coverUrl ?? null,
    bpm: overrides.bpm ?? null,
    key: overrides.key ?? null,
    aiScore: overrides.aiScore ?? 70,
    rankScore: overrides.rankScore ?? 70,
    versusWins: overrides.versusWins ?? 0,
    versusLosses: overrides.versusLosses ?? 0,
    createdAt: overrides.createdAt ?? new Date(),
    licensePrice: overrides.licensePrice ?? 49,
    revenueSharePct: overrides.revenueSharePct ?? 8,
    soldLicenses: overrides.soldLicenses ?? 0,
    totalLicenses: overrides.totalLicenses ?? 100,
  };
}

describe("buildTasteSignal", () => {
  it("aggregates genres, keys, and centroid BPM from purchases", () => {
    const sig = buildTasteSignal([
      { songId: "a", song: { genre: "Trap", key: "C minor", bpm: 140 } },
      { songId: "b", song: { genre: "trap", key: "C minor", bpm: 138 } },
      { songId: "c", song: { genre: "R&B", key: null, bpm: 92 } },
    ]);
    expect(sig.genres.get("trap")).toBe(2);
    expect(sig.genres.get("r&b")).toBe(1);
    expect(sig.keys.get("C minor")).toBe(2);
    // (140+138+92)/3 ≈ 123 — rounded
    expect(sig.bpmCentroid).toBe(123);
    expect(sig.ownedSongIds.has("a")).toBe(true);
  });

  it("returns an empty signal when there are no purchases", () => {
    const sig = buildTasteSignal([]);
    expect(sig.genres.size).toBe(0);
    expect(sig.bpmCentroid).toBe(0);
    expect(sig.ownedSongIds.size).toBe(0);
  });
});

describe("buildMadeForYouRail (personalized path)", () => {
  it("ranks genre matches above generic quality", () => {
    const sig = buildTasteSignal([
      { songId: "owned", song: { genre: "Trap", key: null, bpm: 140 } },
    ]);
    const rail = buildMadeForYouRail(
      [
        candidate({ id: "high-quality-other", aiScore: 95, genre: "Pop" }),
        candidate({ id: "trap-match", aiScore: 60, genre: "Trap" }),
      ],
      sig,
      6,
    );
    expect(rail[0]?.song.id).toBe("trap-match");
    expect(rail[0]?.reason).toMatch(/Trap/);
  });

  it("excludes tracks the viewer already owns", () => {
    const sig = buildTasteSignal([
      { songId: "already-bought", song: { genre: "Trap", key: null, bpm: 140 } },
    ]);
    const rail = buildMadeForYouRail(
      [
        candidate({ id: "already-bought", genre: "Trap", aiScore: 90 }),
        candidate({ id: "fresh", genre: "Trap", aiScore: 60 }),
      ],
      sig,
      6,
    );
    expect(rail.find((p) => p.song.id === "already-bought")).toBeUndefined();
    expect(rail[0]?.song.id).toBe("fresh");
  });

  it("matches by BPM proximity within window", () => {
    const sig = buildTasteSignal([
      { songId: "owned", song: { genre: null, key: null, bpm: 140 } },
    ]);
    const rail = buildMadeForYouRail(
      [
        candidate({ id: "far", aiScore: 80, bpm: 90 }),
        candidate({ id: "near", aiScore: 60, bpm: 138 }),
      ],
      sig,
      6,
    );
    expect(rail[0]?.song.id).toBe("near");
    expect(rail[0]?.reason).toMatch(/BPM/);
  });
});

describe("buildMadeForYouRail (cold path)", () => {
  it("returns one pick per top genre when there is no signal", () => {
    const sig = buildTasteSignal([]);
    const rail = buildMadeForYouRail(
      [
        candidate({ id: "trap-1", genre: "Trap", aiScore: 80 }),
        candidate({ id: "trap-2", genre: "Trap", aiScore: 70 }),
        candidate({ id: "pop-1", genre: "Pop", aiScore: 75 }),
        candidate({ id: "rnb-1", genre: "R&B", aiScore: 90 }),
      ],
      sig,
      3,
    );
    const genres = rail.map((p) => p.song.genre?.toLowerCase());
    // Each genre appears at most once in the cold path.
    expect(new Set(genres).size).toBe(genres.length);
  });

  it("picks the highest-quality representative within each genre", () => {
    const sig = buildTasteSignal([]);
    const rail = buildMadeForYouRail(
      [
        candidate({ id: "trap-low", genre: "Trap", aiScore: 30 }),
        candidate({ id: "trap-high", genre: "Trap", aiScore: 95 }),
      ],
      sig,
      6,
    );
    const trapPick = rail.find((p) => p.song.genre === "Trap");
    expect(trapPick?.song.id).toBe("trap-high");
  });

  it("falls back to top quality when there are not enough genres", () => {
    const sig = buildTasteSignal([]);
    const rail = buildMadeForYouRail(
      [
        candidate({ id: "a", genre: "Trap", aiScore: 50, rankScore: 50 }),
        candidate({ id: "b", genre: "Trap", aiScore: 90, rankScore: 92 }),
        candidate({ id: "c", genre: "Trap", aiScore: 80, rankScore: 80 }),
      ],
      sig,
      3,
    );
    expect(rail.length).toBe(3);
    // Highest quality first overall.
    expect(rail[0]?.song.id).toBe("b");
  });
});
