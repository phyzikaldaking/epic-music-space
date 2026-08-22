import { framesToSeconds } from "./sampleTimeline";

export type TimelineMarker = { id: string; name: string; frame: number; color?: string };
export type SongSection = { id: string; name: string; startFrame: number; endFrame: number; color: string };

export function navigateMarkers(markers: TimelineMarker[], currentFrame: number, direction: "next" | "previous") {
  const frames = [...new Set(markers.map((marker) => Math.max(0, Math.round(marker.frame))))].sort((left, right) => left - right);
  if (direction === "next") return frames.find((frame) => frame > currentFrame) ?? currentFrame;
  return frames.reverse().find((frame) => frame < currentFrame) ?? currentFrame;
}

export function loopRangeForSection(section: SongSection) {
  return { startFrame: Math.max(0, section.startFrame), endFrame: Math.max(section.startFrame, section.endFrame), enabled: true };
}

export function exportRangeForSection(section: SongSection, sampleRate: number) {
  return { name: section.name, startSec: framesToSeconds(section.startFrame, sampleRate), endSec: framesToSeconds(section.endFrame, sampleRate) };
}

export function duplicateSection<T extends { id: string; startFrame: number }>(section: SongSection, items: T[], options: { idFactory: (kind: "section" | "item") => string }) {
  const length = Math.max(1, section.endFrame - section.startFrame);
  const nextStart = section.endFrame;
  return {
    section: { ...section, id: options.idFactory("section"), name: `${section.name} copy`, startFrame: nextStart, endFrame: nextStart + length },
    items: items.filter((item) => item.startFrame >= section.startFrame && item.startFrame < section.endFrame).map((item) => ({ ...item, id: options.idFactory("item"), startFrame: item.startFrame + length })),
  };
}
