import type { StudioClip, StudioTrack } from "./types";

export function visibleClipDuration(clip: StudioClip) {
  return Math.max(0.05, clip.duration - clip.trimStart - clip.trimEnd);
}

export function formatTimelineTime(seconds: number) {
  const safe = Math.max(0, seconds || 0);
  const min = Math.floor(safe / 60);
  const sec = Math.floor(safe % 60);
  const cs = Math.floor((safe % 1) * 100);
  return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

export function calculateSessionEnd(tracks: StudioTrack[]) {
  return Math.max(
    10,
    ...tracks.flatMap((track) =>
      track.clips.map((clip) => clip.start + visibleClipDuration(clip)),
    ),
  );
}

export function snapToGrid(value: number, grid: number, enabled = true) {
  return enabled
    ? Math.max(0, Math.round(value / grid) * grid)
    : Math.max(0, value);
}

export function bpmGridSubdivision(bpm: number, division = 4) {
  const beatsPerSecond = bpm / 60;
  return 1 / (beatsPerSecond * division);
}

export function buildBeatMarkers(sessionEnd: number, bpm: number) {
  const beatLength = 60 / bpm;
  const beats = Math.ceil(sessionEnd / beatLength);
  return Array.from({ length: beats + 1 }, (_, i) => ({
    beat: i,
    seconds: i * beatLength,
  }));
}
