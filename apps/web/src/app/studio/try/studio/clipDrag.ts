import type { StudioClip, StudioEditMode, StudioTrack } from "./types";
import { snapToGrid } from "./timeline";

export type ClipDragIntent = {
  clipId: string;
  sourceTrackId: string;
  targetTrackId: string;
  start: number;
  allowed: boolean;
  reason?: "locked";
};

export function createClipDragIntent(input: {
  clip: StudioClip;
  sourceTrackId: string;
  targetTrackId: string;
  pointerSeconds: number;
  pointerOffsetSeconds: number;
  mode: StudioEditMode | "free";
  gridSeconds: number;
}): ClipDragIntent {
  const rawStart = Math.max(0, input.pointerSeconds - input.pointerOffsetSeconds);
  return {
    clipId: input.clip.id,
    sourceTrackId: input.sourceTrackId,
    targetTrackId: input.targetTrackId,
    start: snapToGrid(rawStart, input.gridSeconds, input.mode === "grid"),
    allowed: !input.clip.locked,
    ...input.clip.locked ? { reason: "locked" as const } : {},
  };
}

export function applyClipDrag(tracks: StudioTrack[], intent: ClipDragIntent) {
  if (!intent.allowed || !tracks.some((track) => track.id === intent.targetTrackId)) return tracks;
  const clip = tracks.find((track) => track.id === intent.sourceTrackId)?.clips.find((item) => item.id === intent.clipId);
  if (!clip || clip.locked) return tracks;
  return tracks.map((track) => {
    const without = track.clips.filter((item) => item.id !== intent.clipId);
    if (track.id !== intent.targetTrackId) return without.length === track.clips.length ? track : { ...track, clips: without };
    return { ...track, clips: [...without, { ...clip, start: intent.start }].sort((left, right) => left.start - right.start) };
  });
}
