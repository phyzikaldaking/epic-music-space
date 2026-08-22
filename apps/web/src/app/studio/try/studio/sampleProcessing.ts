export type PadSampleProcessing = {
  sourceId: string;
  durationFrames: number;
  peaks: number[];
  trimStartFrame: number;
  trimEndFrame: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  tuneCents: number;
  reversed: boolean;
  chokeGroup: number | null;
  envelope: { attackMs: number; decayMs: number; sustain: number; releaseMs: number };
  gainDb: number;
};

export function processPadSample(sample: PadSampleProcessing, patch: Partial<Omit<PadSampleProcessing, "sourceId" | "durationFrames" | "peaks" | "envelope">> & { envelope?: Partial<PadSampleProcessing["envelope"]>; normalizeToDb?: number }) {
  const trimStartFrame = Math.max(0, Math.min(sample.durationFrames - 1, Math.round(patch.trimStartFrame ?? sample.trimStartFrame)));
  const trimEndFrame = Math.max(0, Math.min(sample.durationFrames - trimStartFrame - 1, Math.round(patch.trimEndFrame ?? sample.trimEndFrame)));
  const visibleFrames = sample.durationFrames - trimStartFrame - trimEndFrame;
  const peak = Math.max(0, ...sample.peaks.map((value) => Math.abs(value)));
  const normalizedGain = patch.normalizeToDb === undefined || peak === 0 ? sample.gainDb : Math.max(-24, Math.min(24, patch.normalizeToDb - 20 * Math.log10(peak)));
  const envelope = patch.envelope ?? {};
  const requestedChoke = patch.chokeGroup === undefined ? sample.chokeGroup : patch.chokeGroup;
  const after: PadSampleProcessing = {
    ...sample,
    trimStartFrame,
    trimEndFrame,
    fadeInFrames: Math.max(0, Math.min(visibleFrames, Math.round(patch.fadeInFrames ?? sample.fadeInFrames))),
    fadeOutFrames: Math.max(0, Math.min(visibleFrames, Math.round(patch.fadeOutFrames ?? sample.fadeOutFrames))),
    tuneCents: Math.max(-2400, Math.min(2400, Math.round(patch.tuneCents ?? sample.tuneCents))),
    reversed: patch.reversed ?? sample.reversed,
    chokeGroup: requestedChoke === null ? null : Math.max(1, Math.min(32, Math.round(requestedChoke))),
    envelope: {
      attackMs: Math.max(0, envelope.attackMs ?? sample.envelope.attackMs),
      decayMs: Math.max(0, envelope.decayMs ?? sample.envelope.decayMs),
      sustain: Math.max(0, Math.min(1, envelope.sustain ?? sample.envelope.sustain)),
      releaseMs: Math.max(0, envelope.releaseMs ?? sample.envelope.releaseMs),
    },
    gainDb: Number(normalizedGain.toFixed(4)),
  };
  return { label: "Process pad sample", before: sample, after, undo: sample };
}
