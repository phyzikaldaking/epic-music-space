import { describe, it, expect } from "vitest";
import { publicSong, publicSongs } from "@/lib/serializeSong";

// ---------------------------------------------------------------------------
// publicSong
// ---------------------------------------------------------------------------

describe("publicSong", () => {
  it("removes audioUrl from the returned object", () => {
    const song = { id: "song-1", audioUrl: "https://storage.example.com/file.mp3", title: "My Track" };
    const result = publicSong(song);
    expect(result).not.toHaveProperty("audioUrl");
  });

  it("adds a streamUrl built from the song id", () => {
    const song = { id: "song-42", audioUrl: "https://example.com/file.mp3" };
    const result = publicSong(song);
    expect(result.streamUrl).toBe("/api/songs/song-42/stream");
  });

  it("preserves all other fields on the song object", () => {
    const song = {
      id: "song-abc",
      audioUrl: "https://example.com/file.mp3",
      title: "Beats",
      artistId: "artist-1",
      genre: "Hip-Hop",
      price: 9.99,
    };
    const result = publicSong(song);
    expect(result.id).toBe("song-abc");
    expect(result.title).toBe("Beats");
    expect(result.artistId).toBe("artist-1");
    expect(result.genre).toBe("Hip-Hop");
    expect(result.price).toBe(9.99);
  });

  it("works when audioUrl is null", () => {
    const song = { id: "song-null", audioUrl: null, title: "Silent" };
    const result = publicSong(song);
    expect(result).not.toHaveProperty("audioUrl");
    expect(result.streamUrl).toBe("/api/songs/song-null/stream");
  });

  it("works when audioUrl is undefined (omitted)", () => {
    const song = { id: "song-undef", title: "Ghost Track" };
    const result = publicSong(song);
    expect(result).not.toHaveProperty("audioUrl");
    expect(result.streamUrl).toBe("/api/songs/song-undef/stream");
  });

  it("does not mutate the original song object", () => {
    const song = { id: "song-mut", audioUrl: "https://example.com/a.mp3", title: "Safe" };
    const original = { ...song };
    publicSong(song);
    expect(song).toEqual(original);
  });

  it("streamUrl format is always /api/songs/<id>/stream", () => {
    const ids = ["abc", "123-xyz", "a_b_c", "song-with-dashes"];
    for (const id of ids) {
      const result = publicSong({ id, audioUrl: null });
      expect(result.streamUrl).toBe(`/api/songs/${id}/stream`);
    }
  });
});

// ---------------------------------------------------------------------------
// publicSongs
// ---------------------------------------------------------------------------

describe("publicSongs", () => {
  it("maps over an array and serializes each song", () => {
    const songs = [
      { id: "s1", audioUrl: "https://example.com/1.mp3", title: "One" },
      { id: "s2", audioUrl: "https://example.com/2.mp3", title: "Two" },
      { id: "s3", audioUrl: null, title: "Three" },
    ];
    const results = publicSongs(songs);
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r).not.toHaveProperty("audioUrl");
      expect(r).toHaveProperty("streamUrl");
    }
  });

  it("returns an empty array for an empty input", () => {
    expect(publicSongs([])).toEqual([]);
  });

  it("each result has the correct streamUrl for its song", () => {
    const songs = [
      { id: "alpha", audioUrl: null },
      { id: "beta", audioUrl: "https://example.com/b.mp3" },
    ];
    const results = publicSongs(songs);
    expect(results[0].streamUrl).toBe("/api/songs/alpha/stream");
    expect(results[1].streamUrl).toBe("/api/songs/beta/stream");
  });

  it("preserves extra fields from each song", () => {
    const songs = [
      { id: "s1", audioUrl: null, genre: "Jazz" },
      { id: "s2", audioUrl: null, genre: "Pop" },
    ];
    const results = publicSongs(songs);
    expect(results[0].genre).toBe("Jazz");
    expect(results[1].genre).toBe("Pop");
  });
});
