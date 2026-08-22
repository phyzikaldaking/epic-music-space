import type { StudioClip } from "./types";

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
