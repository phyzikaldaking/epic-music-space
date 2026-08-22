export const STUDIO_RELEASE_JOURNEY = ["create", "record", "edit", "mix", "save", "reopen", "export", "battle"] as const;
export type StudioReleaseStage = typeof STUDIO_RELEASE_JOURNEY[number];
export type StudioReleaseEvidence = { passed: boolean; evidence: string };

export function certifyStudioRelease(results: Partial<Record<StudioReleaseStage, StudioReleaseEvidence>>) {
  const failures = STUDIO_RELEASE_JOURNEY.flatMap((stage) => {
    const result = results[stage];
    return result?.passed ? [] : [{ stage, evidence: result?.evidence ?? "No evidence supplied" }];
  });
  return { certified: failures.length === 0, passed: STUDIO_RELEASE_JOURNEY.length - failures.length, total: STUDIO_RELEASE_JOURNEY.length, failures };
}
