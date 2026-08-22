import type { StudioClip } from "./types";
import { clipStartFrames, visibleClipFrames } from "./timeline";
import { framesToSeconds, secondsToFrames } from "./sampleTimeline";

export type EditableStudioClip = StudioClip & { playbackRate?: number; pitchSemitones?: number; reversed?: boolean };

export function trimClip(clip: EditableStudioClip, trim: { left?: number; right?: number }): EditableStudioClip {
  const left = Math.max(0, Math.min(clip.duration, trim.left ?? clip.trimStart));
  const right = Math.max(0, Math.min(clip.duration - left, trim.right ?? clip.trimEnd));
  return { ...clip, trimStart: left, trimEnd: right };
}

export function setClipFade(clip: EditableStudioClip, patch: { fadeIn?: number; fadeOut?: number }): EditableStudioClip {
  const visible = Math.max(0, clip.duration - clip.trimStart - clip.trimEnd);
  return { ...clip, fadeIn: Math.max(0, Math.min(visible, patch.fadeIn ?? clip.fadeIn)), fadeOut: Math.max(0, Math.min(visible, patch.fadeOut ?? clip.fadeOut)) };
}

export function stretchClip(clip: EditableStudioClip, playbackRate: number): EditableStudioClip {
  return { ...clip, playbackRate: Math.max(.25, Math.min(4, playbackRate)) };
}

export function shiftClipPitch(clip: EditableStudioClip, semitones: number): EditableStudioClip {
  return { ...clip, pitchSemitones: Math.max(-24, Math.min(24, semitones)) };
}

export function normalizeClip(clip: EditableStudioClip, targetDb = -1): EditableStudioClip {
  const peak = Math.max(0, ...clip.peaks.map((sample) => Math.abs(sample)));
  if (peak === 0) return clip;
  const currentPeakDb = 20 * Math.log10(peak);
  return { ...clip, gain: Math.max(-24, Math.min(24, targetDb - currentPeakDb)) };
}

export function crossfadeClips(left: EditableStudioClip, right: EditableStudioClip, requestedOverlap: number) {
  const leftDuration = Math.max(0, left.duration - left.trimStart - left.trimEnd);
  const rightDuration = Math.max(0, right.duration - right.trimStart - right.trimEnd);
  const overlap = Math.max(0, Math.min(requestedOverlap, leftDuration, rightDuration));
  return {
    overlap,
    left: setClipFade(left, { fadeOut: overlap }),
    right: setClipFade(right, { fadeIn: overlap }),
  };
}

export function splitClipAtFrame(
  clip: EditableStudioClip,
  splitFrame: number,
  sampleRate: number,
  ids: { leftId: string; rightId: string },
) {
  const startFrame = clipStartFrames(clip, sampleRate);
  const visibleFrames = visibleClipFrames(clip, sampleRate);
  const localFrames = Math.round(splitFrame) - startFrame;
  if (localFrames <= 0 || localFrames >= visibleFrames) throw new RangeError("Split must be inside the visible clip range.");
  const trimStartFrame = clip.trimStartFrame ?? secondsToFrames(clip.trimStart, sampleRate);
  const trimEndFrame = clip.trimEndFrame ?? secondsToFrames(clip.trimEnd, sampleRate);
  const sourceId = clip.sourceId ?? clip.id;
  const leftTrimEnd = trimEndFrame + visibleFrames - localFrames;
  const rightTrimStart = trimStartFrame + localFrames;
  const left: EditableStudioClip = {
    ...clip,
    id: ids.leftId,
    name: `${clip.name} A`,
    sourceId,
    startFrame,
    start: framesToSeconds(startFrame, sampleRate),
    trimStartFrame,
    trimEndFrame: leftTrimEnd,
    trimStart: framesToSeconds(trimStartFrame, sampleRate),
    trimEnd: framesToSeconds(leftTrimEnd, sampleRate),
  };
  const right: EditableStudioClip = {
    ...clip,
    id: ids.rightId,
    name: `${clip.name} B`,
    sourceId,
    startFrame: Math.round(splitFrame),
    start: framesToSeconds(splitFrame, sampleRate),
    trimStartFrame: rightTrimStart,
    trimEndFrame,
    trimStart: framesToSeconds(rightTrimStart, sampleRate),
    trimEnd: framesToSeconds(trimEndFrame, sampleRate),
  };
  return { label: "Separate clip", before: clip, after: [left, right] as const, undo: clip };
}

export function trimClipFrames(
  clip: EditableStudioClip,
  delta: { leftDeltaFrames?: number; rightDeltaFrames?: number },
  sampleRate: number,
) {
  const durationFrames = clip.durationFrames ?? secondsToFrames(clip.duration, sampleRate);
  const previousLeft = clip.trimStartFrame ?? secondsToFrames(clip.trimStart, sampleRate);
  const previousRight = clip.trimEndFrame ?? secondsToFrames(clip.trimEnd, sampleRate);
  const nextLeft = Math.max(0, Math.min(durationFrames - previousRight - 1, previousLeft + Math.round(delta.leftDeltaFrames ?? 0)));
  const nextRight = Math.max(0, Math.min(durationFrames - nextLeft - 1, previousRight + Math.round(delta.rightDeltaFrames ?? 0)));
  const appliedLeft = nextLeft - previousLeft;
  const startFrame = clipStartFrames(clip, sampleRate) + appliedLeft;
  const after: EditableStudioClip = {
    ...clip,
    sourceId: clip.sourceId ?? clip.id,
    durationFrames,
    startFrame,
    start: framesToSeconds(startFrame, sampleRate),
    trimStartFrame: nextLeft,
    trimEndFrame: nextRight,
    trimStart: framesToSeconds(nextLeft, sampleRate),
    trimEnd: framesToSeconds(nextRight, sampleRate),
  };
  return { label: "Trim clip", before: clip, after, undo: clip };
}

export function slipClipFrames(clip: EditableStudioClip, requestedDeltaFrames: number, sampleRate: number) {
  const trimStartFrame = clip.trimStartFrame ?? secondsToFrames(clip.trimStart, sampleRate);
  const trimEndFrame = clip.trimEndFrame ?? secondsToFrames(clip.trimEnd, sampleRate);
  const deltaFrames = Math.max(-trimStartFrame, Math.min(trimEndFrame, Math.round(requestedDeltaFrames)));
  const nextStart = trimStartFrame + deltaFrames;
  const nextEnd = trimEndFrame - deltaFrames;
  const after: EditableStudioClip = {
    ...clip,
    sourceId: clip.sourceId ?? clip.id,
    trimStartFrame: nextStart,
    trimEndFrame: nextEnd,
    trimStart: framesToSeconds(nextStart, sampleRate),
    trimEnd: framesToSeconds(nextEnd, sampleRate),
  };
  return { label: "Slip clip", before: clip, after, undo: clip, appliedDeltaFrames: deltaFrames };
}

export function buildEqualPowerCrossfade(left: EditableStudioClip, right: EditableStudioClip, requestedOverlapFrames: number, sampleRate: number, pointCount = 33) {
  const overlapFrames = Math.max(0, Math.min(Math.round(requestedOverlapFrames), visibleClipFrames(left, sampleRate), visibleClipFrames(right, sampleRate)));
  const count = Math.max(2, Math.round(pointCount));
  const points = Array.from({ length: count }, (_, index) => {
    const position = index / (count - 1);
    return {
      offsetFrames: Math.round(position * overlapFrames),
      leftGain: Number(Math.cos(position * Math.PI / 2).toFixed(8)),
      rightGain: Number(Math.sin(position * Math.PI / 2).toFixed(8)),
    };
  });
  return {
    curve: "equal-power" as const,
    overlapFrames,
    leftClipId: left.id,
    rightClipId: right.id,
    leftSourceId: left.sourceId ?? left.id,
    rightSourceId: right.sourceId ?? right.id,
    points,
  };
}
