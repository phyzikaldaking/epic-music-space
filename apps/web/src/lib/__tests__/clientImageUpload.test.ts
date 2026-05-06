import { describe, it, expect } from "vitest";
import { pickProcessedImageTarget, guessMimeFromName } from "../clientImageUpload";

describe("pickProcessedImageTarget", () => {
  it("passes GIFs through untouched (preserve animation)", () => {
    const t = pickProcessedImageTarget({ width: 4000, height: 4000, mimeType: "image/gif" });
    expect(t.reencode).toBe(false);
    expect(t.width).toBe(4000);
    expect(t.height).toBe(4000);
  });

  it("leaves an in-bounds JPEG alone", () => {
    const t = pickProcessedImageTarget({ width: 1920, height: 1080, mimeType: "image/jpeg" });
    expect(t.reencode).toBe(false);
    expect(t.width).toBe(1920);
    expect(t.height).toBe(1080);
  });

  it("leaves an in-bounds PNG as PNG (preserve transparency)", () => {
    const t = pickProcessedImageTarget({ width: 600, height: 600, mimeType: "image/png" });
    expect(t.reencode).toBe(false);
    expect(t.outputMime).toBe("image/png");
  });

  it("downscales a 12 MP iPhone shot to fit the 2048 long-edge cap", () => {
    const t = pickProcessedImageTarget({ width: 4032, height: 3024, mimeType: "image/jpeg" });
    expect(t.reencode).toBe(true);
    expect(t.width).toBe(2048);
    // height = round(3024 * 2048/4032) = 1536
    expect(t.height).toBe(1536);
    expect(t.outputMime).toBe("image/jpeg");
  });

  it("re-encodes HEIC to JPEG even when small enough", () => {
    const t = pickProcessedImageTarget({ width: 1024, height: 1024, mimeType: "image/heic" });
    expect(t.reencode).toBe(true);
    expect(t.outputMime).toBe("image/jpeg");
    expect(t.outputExt).toBe("jpg");
  });

  it("re-encodes WebP only when it exceeds the long-edge cap", () => {
    const small = pickProcessedImageTarget({ width: 800, height: 800, mimeType: "image/webp" });
    expect(small.reencode).toBe(false);
    const big = pickProcessedImageTarget({ width: 4000, height: 2000, mimeType: "image/webp" });
    expect(big.reencode).toBe(true);
    expect(big.width).toBe(2048);
    expect(big.height).toBe(1024);
  });

  it("preserves PNG output when downscaling a giant PNG (transparency-safe)", () => {
    const t = pickProcessedImageTarget({ width: 5000, height: 5000, mimeType: "image/png" });
    expect(t.reencode).toBe(true);
    expect(t.outputMime).toBe("image/png");
    expect(t.outputExt).toBe("png");
  });

  it("normalizes mixed-case MIME inputs", () => {
    const t = pickProcessedImageTarget({ width: 1024, height: 1024, mimeType: "Image/HEIC" });
    expect(t.reencode).toBe(true);
    expect(t.outputMime).toBe("image/jpeg");
  });
});

describe("guessMimeFromName", () => {
  it("guesses common image extensions", () => {
    expect(guessMimeFromName("photo.jpg")).toBe("image/jpeg");
    expect(guessMimeFromName("photo.JPEG")).toBe("image/jpeg");
    expect(guessMimeFromName("a.png")).toBe("image/png");
    expect(guessMimeFromName("camera.HEIC")).toBe("image/heic");
    expect(guessMimeFromName("loop.gif")).toBe("image/gif");
  });

  it("returns empty string for unknown / no extension", () => {
    expect(guessMimeFromName("noext")).toBe("");
    expect(guessMimeFromName("file.xyz")).toBe("");
    expect(guessMimeFromName("")).toBe("");
  });
});
