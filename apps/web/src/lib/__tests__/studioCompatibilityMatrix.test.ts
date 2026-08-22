import { describe, expect, it } from "vitest";
import { certifyStudioBrowser } from "@/app/studio/try/studio/studioCompatibilityMatrix";

describe("Studio browser compatibility", () => {
  it("certifies full desktop audio capability", () => {
    expect(certifyStudioBrowser({ audioContext: true, audioWorklet: true, mediaRecorder: true, mediaDevices: true, indexedDb: true, pointerEvents: true, sharedArrayBuffer: true, mobile: false })).toMatchObject({ tier: "pro", canRecord: true, canEdit: true, canMix: true, limitations: [] });
  });

  it("offers an explicit mobile fallback without pretending pro monitoring works", () => {
    const result = certifyStudioBrowser({ audioContext: true, audioWorklet: false, mediaRecorder: true, mediaDevices: true, indexedDb: true, pointerEvents: true, sharedArrayBuffer: false, mobile: true });
    expect(result).toMatchObject({ tier: "creator", canRecord: true, canEdit: true, canMix: true });
    expect(result.limitations).toContain("Low-latency monitoring is unavailable; direct monitoring is recommended.");
  });

  it("falls back to review-only when Web Audio is unavailable", () => {
    expect(certifyStudioBrowser({ audioContext: false, audioWorklet: false, mediaRecorder: false, mediaDevices: false, indexedDb: false, pointerEvents: false, sharedArrayBuffer: false, mobile: false })).toMatchObject({ tier: "review", canRecord: false, canEdit: false, canMix: false });
  });
});
