import { describe, it, expect } from "vitest";
import { classifyAudioSource, isEmbedSource } from "../audioSource";

describe("classifyAudioSource — direct streams", () => {
  it("recognizes Supabase Storage URLs as streamable", () => {
    const result = classifyAudioSource(
      "https://oynplifjdizzdahnurgi.supabase.co/storage/v1/object/public/audio/abc/123.mp3",
    );
    expect(result.type).toBe("stream");
    expect(result.playableInline).toBe(true);
  });

  it("recognizes Supabase URLs without an extension", () => {
    const result = classifyAudioSource(
      "https://example.supabase.co/storage/v1/object/sign/audio/abc?token=foo",
    );
    expect(result.type).toBe("stream");
  });

  it("recognizes S3 URLs", () => {
    const result = classifyAudioSource(
      "https://my-bucket.s3.us-west-2.amazonaws.com/audio/abc.mp3",
    );
    expect(result.type).toBe("stream");
  });

  it("recognizes URLs ending in known audio extensions", () => {
    for (const ext of ["mp3", "wav", "flac", "m4a", "aac", "ogg", "webm", "oga"]) {
      const result = classifyAudioSource(`https://example.com/audio.${ext}`);
      expect(result.type).toBe("stream");
    }
  });
});

describe("classifyAudioSource — embeds", () => {
  it("classifies YouTube watch + youtu.be + shorts as youtube", () => {
    expect(classifyAudioSource("https://www.youtube.com/watch?v=abc123XYZ_-").type).toBe("youtube");
    expect(classifyAudioSource("https://youtu.be/abc123XYZ_-").type).toBe("youtube");
    expect(classifyAudioSource("https://www.youtube.com/shorts/abc123XYZ_-").type).toBe("youtube");
  });

  it("classifies Vimeo as vimeo", () => {
    expect(classifyAudioSource("https://vimeo.com/123456789").type).toBe("vimeo");
  });

  it("classifies SoundCloud as soundcloud", () => {
    expect(classifyAudioSource("https://soundcloud.com/artist/track").type).toBe("soundcloud");
  });

  it("classifies Spotify track as spotify", () => {
    expect(classifyAudioSource("https://open.spotify.com/track/abcdef").type).toBe("spotify");
  });
});

describe("classifyAudioSource — unknown", () => {
  it("returns unknown for arbitrary URLs", () => {
    expect(classifyAudioSource("https://example.com/page.html").type).toBe("unknown");
    expect(classifyAudioSource("not-a-url").type).toBe("unknown");
    expect(classifyAudioSource("").type).toBe("unknown");
    expect(classifyAudioSource(null).type).toBe("unknown");
    expect(classifyAudioSource(undefined).type).toBe("unknown");
  });
});

describe("isEmbedSource", () => {
  it("returns true only for embeddable third-party sources", () => {
    expect(isEmbedSource("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isEmbedSource("https://soundcloud.com/x/y")).toBe(true);
    expect(isEmbedSource("https://x.supabase.co/storage/v1/object/public/audio/a.mp3")).toBe(false);
    expect(isEmbedSource("https://example.com/page.html")).toBe(false);
  });
});
