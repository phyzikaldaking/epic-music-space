import { describe, expect, it } from "vitest";
import { diagnoseStudioFinish } from "@/app/studio/try/studio/finishDiagnostics";

describe("Studio finish diagnostics", () => {
  it("reports every required mix risk with actionable severity", () => {
    const report = diagnoseStudioFinish({ truePeakDb: .4, integratedLufs: -20, phaseCorrelation: -.2, lowEndEnergyRatio: .55, longestSilenceSec: 4 });
    expect(report.issues.map((issue) => issue.code)).toEqual(["clipping", "loudness", "phase", "low-end", "silence", "headroom"]);
    expect(report.ready).toBe(false);
  });
  it("certifies a healthy master", () => {
    expect(diagnoseStudioFinish({ truePeakDb: -1, integratedLufs: -14, phaseCorrelation: .5, lowEndEnergyRatio: .25, longestSilenceSec: .5 })).toMatchObject({ ready: true, issues: [], headroomDb: 1 });
  });
});
