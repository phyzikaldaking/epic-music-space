import { describe, expect, it } from "vitest";
import { adoptAnalyzedTempo, analyzeTempoFromOnsets } from "@/app/studio/try/studio/audioAnalysis";

describe("Studio tempo analysis", () => {
  it("detects tempo from regular onsets with confidence", () => {
    const result = analyzeTempoFromOnsets([0, 24_000, 48_000, 72_000, 96_000], 48_000);
    expect(result).toMatchObject({ bpm: 120, confidence: 1, detected: true });
  });

  it("returns an uncertain result for insufficient or inconsistent evidence", () => {
    expect(analyzeTempoFromOnsets([], 48_000)).toMatchObject({ bpm: null, confidence: 0, detected: false });
    expect(analyzeTempoFromOnsets([0, 10_000, 50_000, 58_000], 48_000).confidence).toBeLessThan(.6);
  });

  it("does not change project BPM until adoption is explicitly requested", () => {
    const analysis = analyzeTempoFromOnsets([0, 24_000, 48_000], 48_000);
    expect(analysis.projectBpm).toBeUndefined();
    expect(adoptAnalyzedTempo(92, analysis)).toMatchObject({ before: 92, after: 120, undo: 92 });
    expect(adoptAnalyzedTempo(92, { bpm: null, confidence: 0, detected: false })).toMatchObject({ before: 92, after: 92 });
  });
});
