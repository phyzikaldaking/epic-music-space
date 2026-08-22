export type FinishIssueCode = "clipping" | "loudness" | "phase" | "low-end" | "silence" | "headroom";

export function diagnoseStudioFinish(metrics: { truePeakDb: number; integratedLufs: number; phaseCorrelation: number; lowEndEnergyRatio: number; longestSilenceSec: number }) {
  const issues: Array<{ code: FinishIssueCode; severity: "warning" | "error"; message: string }> = [];
  if (metrics.truePeakDb > 0) issues.push({ code: "clipping", severity: "error", message: "True peak exceeds 0 dBFS." });
  if (metrics.integratedLufs < -16 || metrics.integratedLufs > -9) issues.push({ code: "loudness", severity: "warning", message: "Integrated loudness is outside the -16 to -9 LUFS delivery range." });
  if (metrics.phaseCorrelation < 0) issues.push({ code: "phase", severity: "warning", message: "Negative phase correlation may collapse in mono." });
  if (metrics.lowEndEnergyRatio > .4) issues.push({ code: "low-end", severity: "warning", message: "Low-frequency energy is masking the mix." });
  if (metrics.longestSilenceSec > 2) issues.push({ code: "silence", severity: "warning", message: "Unexpected silence longer than two seconds was detected." });
  const headroomDb = Number((-metrics.truePeakDb).toFixed(2));
  if (headroomDb < .5) issues.push({ code: "headroom", severity: "error", message: "Leave at least 0.5 dB of true-peak headroom." });
  return { ready: issues.length === 0, issues, headroomDb };
}
