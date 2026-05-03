import type { ViralClip } from "@/lib/viralClips";

export type BehaviorEventType = "view" | "watch_75" | "like" | "share" | "skip" | "view_track";

export type BehaviorEvent = {
  clipId: string;
  songId?: string | null;
  artist?: string | null;
  eventType: BehaviorEventType;
  eventCategory?: string | null;
  value?: number;
  createdAt?: string;
};

const weights: Record<BehaviorEventType, number> = {
  view: 1,
  watch_75: 8,
  like: 10,
  share: 16,
  skip: -8,
  view_track: 14,
};

export function scoreUserAffinity(events: BehaviorEvent[]) {
  return events.reduce<Record<string, number>>((acc, event) => {
    const key = event.artist || event.songId || event.eventCategory || "global";
    acc[key] = (acc[key] ?? 0) + weights[event.eventType] + Number(event.value ?? 0);
    return acc;
  }, {});
}

export function calculateForYouScore(clip: ViralClip, events: BehaviorEvent[]) {
  const affinity = scoreUserAffinity(events);
  const base = clip.score * 2 + clip.likes * 0.12 + clip.shares * 0.25 + clip.comments * 0.35;
  const artistBoost = clip.artist ? affinity[clip.artist] ?? 0 : 0;
  const songBoost = clip.songId ? affinity[clip.songId] ?? 0 : 0;
  const typeBoost = affinity[clip.eventType] ?? 0;
  const ageHours = Math.max(1, (Date.now() - new Date(clip.createdAt).getTime()) / 3_600_000);
  const freshness = 1 / Math.pow(ageHours, 0.35);
  return Math.round((base + artistBoost * 3 + songBoost * 2 + typeBoost) * freshness);
}

export function personalizeClips(clips: ViralClip[], events: BehaviorEvent[]) {
  return [...clips].sort((a, b) => calculateForYouScore(b, events) - calculateForYouScore(a, events));
}
