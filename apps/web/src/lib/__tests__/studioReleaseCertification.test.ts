import { describe, expect, it } from "vitest";
import { certifyStudioRelease, STUDIO_RELEASE_JOURNEY } from "@/app/studio/try/studio/releaseCertification";

describe("Studio release certification", () => {
  it("requires the complete creation-to-Battle journey", () => {
    expect(STUDIO_RELEASE_JOURNEY).toEqual(["create", "record", "edit", "mix", "save", "reopen", "export", "battle"]);
    const report = certifyStudioRelease(Object.fromEntries(STUDIO_RELEASE_JOURNEY.map((stage) => [stage, { passed: true, evidence: `${stage}-ok` }])));
    expect(report).toMatchObject({ certified: true, passed: 8, total: 8, failures: [] });
  });
  it("fails closed with exact missing or failed stages", () => {
    const report = certifyStudioRelease({ create: { passed: true, evidence: "ok" }, record: { passed: false, evidence: "mic denied" } });
    expect(report.certified).toBe(false);
    expect(report.failures.map((failure) => failure.stage)).toEqual(["record", "edit", "mix", "save", "reopen", "export", "battle"]);
  });
});
