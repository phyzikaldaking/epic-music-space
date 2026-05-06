import { describe, it, expect } from "vitest";
import { validateUpload, getExtension, MAX_AUDIO_BYTES } from "../uploadValidation";

function file(name: string, type: string, size: number) {
  return { name, type, size };
}

describe("getExtension", () => {
  it("lowercases and strips non-alphanumeric", () => {
    expect(getExtension("Track.MP3")).toBe("mp3");
    expect(getExtension("My Song.M4A")).toBe("m4a");
  });
  it("returns null for extension-less files", () => {
    expect(getExtension("noext")).toBeNull();
    expect(getExtension("trailing.")).toBeNull();
  });
  it("caps weird extensions at 8 chars (defensive)", () => {
    // hidden-file edge case — irrelevant for our allowlist match,
    // but documents the safety cap.
    expect(getExtension(".gitignore")).toBe("gitignor");
  });
});

describe("validateUpload — audio", () => {
  it("accepts standard MP3 with proper MIME", () => {
    expect(validateUpload("audio", file("track.mp3", "audio/mpeg", 5_000_000))).toEqual({ ok: true });
  });

  it("accepts iPhone Voice Memo (audio/mp4 + .m4a)", () => {
    expect(validateUpload("audio", file("memo.m4a", "audio/mp4", 8_000_000))).toEqual({ ok: true });
  });

  it("accepts iCloud-shared file with empty MIME but .m4a extension", () => {
    expect(validateUpload("audio", file("song.m4a", "", 9_000_000))).toEqual({ ok: true });
  });

  it("accepts files with octet-stream MIME if extension matches", () => {
    expect(
      validateUpload("audio", file("song.flac", "application/octet-stream", 12_000_000)),
    ).toEqual({ ok: true });
  });

  it("rejects empty file", () => {
    const result = validateUpload("audio", file("track.mp3", "audio/mpeg", 0));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/empty/i);
  });

  it("rejects oversized file with friendly message", () => {
    const result = validateUpload("audio", file("huge.wav", "audio/wav", MAX_AUDIO_BYTES + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/200 MB/);
      expect(result.reason).toMatch(/smaller/i);
    }
  });

  it("rejects unrelated file types with mention of M4A", () => {
    const result = validateUpload("audio", file("doc.pdf", "application/pdf", 100_000));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/M4A/);
  });
});

describe("validateUpload — cover", () => {
  it("accepts HEIC from iPhone camera roll", () => {
    expect(validateUpload("cover", file("IMG_1234.HEIC", "image/heic", 2_000_000))).toEqual({ ok: true });
  });
  it("accepts HEIC even when MIME is empty (cloud share)", () => {
    expect(validateUpload("cover", file("IMG_1234.heic", "", 2_000_000))).toEqual({ ok: true });
  });
  it("rejects audio files with cover-specific message", () => {
    const result = validateUpload("cover", file("track.mp3", "audio/mpeg", 4_000_000));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/JPG|PNG|WebP|HEIC/);
  });
});

describe("validateUpload — stem", () => {
  it("accepts a ZIP", () => {
    expect(validateUpload("stem", file("stems.zip", "application/zip", 100_000_000))).toEqual({ ok: true });
  });
  it("accepts a single WAV trackout", () => {
    expect(validateUpload("stem", file("trackout.wav", "audio/wav", 80_000_000))).toEqual({ ok: true });
  });
  it("rejects 1GB stem with friendly message", () => {
    const result = validateUpload("stem", file("huge.zip", "application/zip", 1024 * 1024 * 1024));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/500 MB/);
  });
});
