import type { StudioClip } from "./types";
import { framesToSeconds, secondsToFrames } from "./sampleTimeline";

export function applyTimeStretch(clip: StudioClip, requestedRatio: number, options: {
  algorithm: "phase-vocoder" | "granular";
  quality: "preview" | "high";
  sampleRate: number;
}) {
  const ratio = Math.max(.25, Math.min(4, Number.isFinite(requestedRatio) ? requestedRatio : 1));
  const sourceFrames = clip.durationFrames ?? secondsToFrames(clip.duration, options.sampleRate);
  const durationFrames = Math.max(1, Math.round(sourceFrames * ratio));
  const after: StudioClip = {
    ...clip,
    sourceId: clip.sourceId ?? clip.id,
    durationFrames,
    duration: framesToSeconds(durationFrames, options.sampleRate),
    playbackRate: 1 / ratio,
    timeStretch: { ratio, preservesPitch: true, algorithm: options.algorithm, quality: options.quality },
  };
  return { label: "Time stretch clip", before: clip, after, undo: clip };
}

export function applyPitchShift(clip: StudioClip, options: {
  semitones: number;
  cents: number;
  algorithm: "elastique" | "realtime";
  preserveFormants: boolean;
}) {
  const requestedCents = Math.round((Number.isFinite(options.semitones) ? options.semitones : 0) * 100 + (Number.isFinite(options.cents) ? options.cents : 0));
  const totalCents = Math.max(-2400, Math.min(2400, requestedCents));
  const pitchSemitones = Math.floor(totalCents / 100);
  const pitchCents = totalCents - pitchSemitones * 100;
  const after: StudioClip = {
    ...clip,
    sourceId: clip.sourceId ?? clip.id,
    pitchSemitones,
    pitchCents,
    pitchShift: { totalCents, algorithm: options.algorithm, preserveFormants: options.preserveFormants },
  };
  return { label: "Pitch shift clip", before: clip, after, undo: clip };
}
