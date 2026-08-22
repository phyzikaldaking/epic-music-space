import { describe, expect, it } from "vitest";
import { cancelPadSamplePreview, commitPadSamplePreview, previewPadSample } from "@/app/studio/try/studio/padReplacement";

const pad = { id: "kick", sampleId: "sample-old", steps: [{ active: true, velocity: .8 }, { active: false, velocity: .5 }] };

describe("Studio pad sample replacement", () => {
  it("previews a candidate without mutating pad or pattern data", () => {
    const preview = previewPadSample(pad, "sample-new");
    expect(preview).toMatchObject({ status: "previewing", originalSampleId: "sample-old", candidateSampleId: "sample-new" });
    expect(pad.sampleId).toBe("sample-old");
    expect(cancelPadSamplePreview(preview)).toEqual(pad);
  });

  it("commits only the sample identity and returns undo state", () => {
    const command = commitPadSamplePreview(previewPadSample(pad, "sample-new"));
    expect(command.after).toMatchObject({ sampleId: "sample-new", steps: pad.steps });
    expect(command.undo).toEqual(pad);
  });
});
