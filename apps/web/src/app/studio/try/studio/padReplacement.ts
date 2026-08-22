export type SamplePad<TStep = unknown> = { id: string; sampleId: string; steps: TStep[] };
export type PadSamplePreview<TStep = unknown> = { status: "previewing"; pad: SamplePad<TStep>; originalSampleId: string; candidateSampleId: string };

export function previewPadSample<TStep>(pad: SamplePad<TStep>, candidateSampleId: string): PadSamplePreview<TStep> {
  return { status: "previewing", pad: structuredClone(pad), originalSampleId: pad.sampleId, candidateSampleId };
}

export function cancelPadSamplePreview<TStep>(preview: PadSamplePreview<TStep>) {
  return { ...structuredClone(preview.pad), sampleId: preview.originalSampleId };
}

export function commitPadSamplePreview<TStep>(preview: PadSamplePreview<TStep>) {
  const before = cancelPadSamplePreview(preview);
  const after = { ...structuredClone(preview.pad), sampleId: preview.candidateSampleId };
  return { label: "Replace pad sample", before, after, undo: before };
}
