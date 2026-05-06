import { describe, it, expect } from "vitest";
import { CACHE_TAGS } from "@/lib/cacheTags";

// ---------------------------------------------------------------------------
// Static tags
// ---------------------------------------------------------------------------

describe("CACHE_TAGS static tags", () => {
  it("homepage tag has the expected value", () => {
    expect(CACHE_TAGS.homepage).toBe("ems:homepage");
  });

  it("songs tag has the expected value", () => {
    expect(CACHE_TAGS.songs).toBe("ems:songs");
  });

  it("battles tag has the expected value", () => {
    expect(CACHE_TAGS.battles).toBe("ems:battles");
  });

  it("demoTracks tag has the expected value", () => {
    expect(CACHE_TAGS.demoTracks).toBe("ems:demo-tracks");
  });

  it("all static tags start with the 'ems:' namespace prefix", () => {
    const staticTags = [
      CACHE_TAGS.homepage,
      CACHE_TAGS.songs,
      CACHE_TAGS.battles,
      CACHE_TAGS.demoTracks,
    ];
    for (const tag of staticTags) {
      expect(tag).toMatch(/^ems:/);
    }
  });
});

// ---------------------------------------------------------------------------
// Factory tag — CACHE_TAGS.track(id)
// ---------------------------------------------------------------------------

describe("CACHE_TAGS.track factory", () => {
  it("returns a string that contains the provided id", () => {
    const id = "song-123";
    expect(CACHE_TAGS.track(id)).toContain(id);
  });

  it("generates the correct format 'ems:track:<id>'", () => {
    expect(CACHE_TAGS.track("abc")).toBe("ems:track:abc");
  });

  it("generates unique tags for different ids", () => {
    const tag1 = CACHE_TAGS.track("id-1");
    const tag2 = CACHE_TAGS.track("id-2");
    expect(tag1).not.toBe(tag2);
  });

  it("preserves ids that contain hyphens and underscores", () => {
    expect(CACHE_TAGS.track("my-song_123")).toBe("ems:track:my-song_123");
  });

  it("works with a UUID-shaped id", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(CACHE_TAGS.track(uuid)).toBe(`ems:track:${uuid}`);
  });
});
