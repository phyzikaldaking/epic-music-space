import { describe, it, expect } from "vitest";
import {
  parseDecimal,
  validateTrackSubmission,
  type TrackFormState,
} from "../trackPublishValidation";

const VALID_SUPABASE_URL =
  "https://oynplifjdizzdahnurgi.supabase.co/storage/v1/object/public/audio/abc123/1730000000-xy.mp3";

const VALID_YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

function baseState(overrides: Partial<TrackFormState> = {}): TrackFormState {
  return {
    title: "My Track",
    artistName: "Test Artist",
    genre: "Trap",
    description: "",
    audioUrl: VALID_SUPABASE_URL,
    audioFromOurUpload: true,
    coverUrl: "",
    stemUrl: "",
    bpm: "140",
    key: "C minor",
    licensePrice: "9.99",
    revenueSharePct: "10",
    totalLicenses: "100",
    allowFreeDownload: false,
    isLegacy: false,
    originalReleaseYear: "",
    ...overrides,
  };
}

describe("parseDecimal", () => {
  it("parses period-decimal inputs", () => {
    expect(parseDecimal("9.99")).toBe(9.99);
    expect(parseDecimal("0.5")).toBe(0.5);
  });

  it("parses comma-decimal (EU keyboards)", () => {
    expect(parseDecimal("9,99")).toBe(9.99);
    expect(parseDecimal("0,5")).toBe(0.5);
  });

  it("trims surrounding whitespace", () => {
    expect(parseDecimal("  12.50  ")).toBe(12.5);
  });

  it("returns NaN for non-numeric input", () => {
    expect(Number.isFinite(parseDecimal(""))).toBe(false);
    expect(Number.isFinite(parseDecimal("abc"))).toBe(false);
  });
});

describe("validateTrackSubmission — happy path", () => {
  it("accepts a valid uploaded track", () => {
    const result = validateTrackSubmission(baseState());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.audioUrl).toBe(VALID_SUPABASE_URL);
      expect(result.payload.title).toBe("My Track");
      expect(result.payload.licensePrice).toBe(9.99);
      expect(result.payload.bpm).toBe(140);
      expect(result.payload.totalLicenses).toBe(100);
      expect(result.payload.isLegacy).toBe(false);
      expect(result.payload.originalReleaseYear).toBeUndefined();
    }
  });

  it("trusts an uploaded URL even when classifyAudioSource would call it unknown", () => {
    const weirdUploadedUrl = "https://cdn.example.com/audio/abc.bin?signed=1";
    const result = validateTrackSubmission(
      baseState({ audioUrl: weirdUploadedUrl, audioFromOurUpload: true }),
    );
    // This is the regression-protection assertion: an upload from our
    // pipeline must publish even if the URL host changes shape.
    expect(result.ok).toBe(true);
  });

  it("accepts pasted YouTube/Vimeo/SoundCloud/Spotify URLs", () => {
    for (const url of [
      VALID_YOUTUBE_URL,
      "https://vimeo.com/123456789",
      "https://soundcloud.com/artist/track",
      "https://open.spotify.com/track/abcd",
    ]) {
      const result = validateTrackSubmission(
        baseState({ audioUrl: url, audioFromOurUpload: false }),
      );
      expect(result.ok).toBe(true);
    }
  });

  it("includes isLegacy + originalReleaseYear when legacy toggle is on", () => {
    const result = validateTrackSubmission(
      baseState({ isLegacy: true, originalReleaseYear: "2003" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.isLegacy).toBe(true);
      expect(result.payload.originalReleaseYear).toBe(2003);
    }
  });

  it("parses comma-decimal license prices (locale tolerance)", () => {
    const result = validateTrackSubmission(baseState({ licensePrice: "9,99" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.licensePrice).toBe(9.99);
  });
});

describe("validateTrackSubmission — gating", () => {
  it("rejects empty audio URL", () => {
    const result = validateTrackSubmission(
      baseState({ audioUrl: "", audioFromOurUpload: false }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/upload an audio/i);
  });

  it("rejects an unknown pasted URL", () => {
    const result = validateTrackSubmission(
      baseState({
        audioUrl: "https://attacker.com/foo.html",
        audioFromOurUpload: false,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/can't recognize/i);
  });

  it("rejects missing title", () => {
    const result = validateTrackSubmission(baseState({ title: "  " }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/title/i);
  });

  it("rejects missing artist name", () => {
    const result = validateTrackSubmission(baseState({ artistName: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/artist/i);
  });

  it("rejects sub-50¢ license price", () => {
    const result = validateTrackSubmission(baseState({ licensePrice: "0.10" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/0\.50/);
  });

  it("rejects revenue share above 100%", () => {
    const result = validateTrackSubmission(baseState({ revenueSharePct: "150" }));
    expect(result.ok).toBe(false);
  });

  it("rejects out-of-range BPM", () => {
    const result = validateTrackSubmission(baseState({ bpm: "10" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/bpm/i);
  });

  it("rejects garbage numeric inputs without crashing", () => {
    const result = validateTrackSubmission(baseState({ licensePrice: "free" }));
    expect(result.ok).toBe(false);
  });
});

describe("validateTrackSubmission — payload shape", () => {
  it("collapses optional fields to undefined when blank", () => {
    const result = validateTrackSubmission(
      baseState({ description: "  ", coverUrl: "", stemUrl: "", genre: "", key: "" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.description).toBeUndefined();
      expect(result.payload.coverUrl).toBeUndefined();
      expect(result.payload.stemUrl).toBeUndefined();
      expect(result.payload.genre).toBeUndefined();
      expect(result.payload.key).toBeUndefined();
      expect(result.payload.hasStems).toBe(false);
    }
  });

  it("flips hasStems when a stem URL is provided", () => {
    const result = validateTrackSubmission(
      baseState({ stemUrl: "https://x.supabase.co/storage/v1/object/public/audio/stems/a/b.zip" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.hasStems).toBe(true);
  });

  it("ignores originalReleaseYear when isLegacy is off", () => {
    const result = validateTrackSubmission(
      baseState({ isLegacy: false, originalReleaseYear: "2003" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.originalReleaseYear).toBeUndefined();
  });

  it("rounds fractional bpm / totalLicenses to integers", () => {
    const result = validateTrackSubmission(
      baseState({ bpm: "140.7", totalLicenses: "99.6" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.bpm).toBe(141);
      expect(result.payload.totalLicenses).toBe(100);
    }
  });
});
